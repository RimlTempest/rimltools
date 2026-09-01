# qrcc2 アーキテクチャ

QR / バーコードの **生成・読み取り・管理・印刷** を行う Web アプリ。
Cloudflare の無料枠内で運用しきることを絶対条件とする。

- 本番: `https://qrcc.riml4i.com`
- 前身: [RimlTempest/QRCC](https://github.com/RimlTempest/QRCC)（2021 / Gatsby）

## 1. 全体像

```
                      ┌──────────────────────────────────────────┐
  ブラウザ ──────────▶│ Worker: qrcc-web  (entry / TypeScript)   │
   ├ qrcc_core.wasm   │  TanStack Start SSR + RSC                │
   │  (生成/デコードを │  Better Auth (Google / Anonymous)        │
   │   端末側で実行)   │  認可・レート制限・composition root       │
   └ Static Assets ◀──│  Static Assets binding                   │
                      └───────────────┬──────────────────────────┘
                                      │ Service Binding (RPC)
                                      │ ※追加のリクエスト課金なし
                      ┌───────────────▼──────────────────────────┐
                      │ Worker: qrcc-api  (auxiliary / Rust→WASM)│
                      │  shared/kernel/engine     共有プリミティブ  │
                      │  features/generate/engine 生成 (SVG/PNG)    │
                      │  features/scan/engine     デコード (rxing)  │
                      │  features/print/engine    ラベル面付け     │
                      │  codes / folders / shares の CRUD        │
                      └────────────────┬─────────────────────────┘
                                       │
                                    ┌──▼──┐
                                    │ D1  │   ※KV / R2 は使わない
                                    │メタ  │     （ADR-0009）
                                    │データ│
                                    └─────┘
```

`qrcc-api` は **ルートを持たない**（インターネットから直接叩けない）。
到達経路は `qrcc-web` からの service binding のみ。認証・認可は `qrcc-web` が
行い、検証済みの `UserId` を RPC 引数として渡す。

## 2. なぜこの形か

| 決定                               | 理由                                                                                | 詳細                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------- |
| Auxiliary Worker + Service Binding | 同一デプロイ単位・同一ドメイン・CORS なし・**サブリクエストに追加課金なし**         | [ADR-0002](adr/0002-auxiliary-worker-split.md) |
| Rust をコアに置く                  | 生成/デコード/PDF は計算主体。CPU 10ms 制限下で有利。同じコードをブラウザにも配れる | [ADR-0003](adr/0003-rust-core-dual-target.md)  |
| 同一 crate を 2 ターゲットにビルド | ブラウザで生成できれば Worker リクエストを消費しない = 無料枠を守る最大の手段       | [ADR-0003](adr/0003-rust-core-dual-target.md)  |
| 認証は TS 側 (Better Auth)         | Google OAuth / 匿名 / セッション管理のエコシステムが TS に集中している              | [ADR-0004](adr/0004-auth-guest-and-google.md)  |
| TanStack Start + RSC               | クライアント主導の RSC。重い依存をサーバに残しつつ、ルーティングは型安全            | [ADR-0001](adr/0001-stack-selection.md)        |

## 3. ディレクトリ構成

**機能で割る（co-location / 縦割り）。** 1 つの機能に必要なものは
型・ロジック・UI・ルート・Rust エンジンまで 1 ディレクトリに集まる（[ADR-0007](adr/0007-feature-colocation.md)）。

```
qrcc2/
├─ features/                  ← 機能単位。1 レーン = 1 ディレクトリ
│  ├─ shell/                  @qrcc/shell     ドキュメント・レイアウト・テーマ
│  ├─ generate/               @qrcc/generate  生成
│  │  ├─ contract/            型・API 契約（TS）
│  │  ├─ core/                純粋ロジック（TS・I/O なし）
│  │  ├─ ui/                  React・CSS・テスト
│  │  │  ├─ generate.route.tsx    ルート定義（型の所有は apps/web）
│  │  │  └─ generate-screen.tsx   画面（feature 所有・テスト対象）
│  │  ├─ server/              server functions（qrcc-web で動く）
│  │  ├─ engine/              Rust: qrcc-generate（worker 非依存・wasm にも載る）
│  │  └─ package.json         公開面は exports に列挙したサブパスだけ
│  ├─ scan/                   @qrcc/scan      読み取り（engine: qrcc-scan / rxing）
│  ├─ print/                  @qrcc/print     印刷（engine: qrcc-print）
│  ├─ manage/                 @qrcc/manage    一覧・編集・共有
│  └─ auth/                   @qrcc/auth      ゲスト / Google ログイン
├─ shared/
│  ├─ contract/               @qrcc/contract  Result・Brand・共通 ID・エラー
│  ├─ kernel/engine/          Rust: qrcc-kernel  共有プリミティブ
│  ├─ ui/                     @qrcc/ui        デザインシステム・トークン
│  └─ wasm/                   @qrcc/wasm      ブラウザ向け wasm（engine + TS ラッパ）
├─ apps/
│  ├─ web/                    薄いシェル。Vite/Wrangler 設定・router・URL 構成
│  │  ├─ src/routes.ts        URL 構造だけを宣言する唯一の横断ファイル
│  │  └─ tsr.config.json      routesDirectory = ../../features
│  └─ api/                    薄いシェル。features/*/engine と worker を束ねる
├─ e2e/                       Playwright（Large / a11y）
├─ docs/                      本ドキュメント群
├─ .agents/skills/            エージェント用スキル（.claude/skills から symlink）
├─ tools/                     oxlint プラグイン・markuplint 隔離インストール
└─ scripts/                   wt.sh（worktree）・補助
```

### 依存の向き

```
shared/contract ◀── shared/ui ◀──┐
       ▲                          │
       └── features/<name>/contract ── core ── ui ── server
                              │
                              └── engine (Rust) ──▶ shared/kernel/engine
                                        │
                    ┌───────────────────┴────────────────┐
                    ▼                                    ▼
             shared/wasm (ブラウザ)                 apps/api (Worker)
```

規約（CI の `guard` が機械的に検査する）:

- `shared/contract` は何にも依存しない
- `contract` / `core` に I/O を書かない
- `engine` は `worker` crate に依存しない。I/O は `features/<name>/worker` へ
- feature 同士は `@qrcc/<name>` の公開サブパス経由でのみ依存する
  （相対パスで他 feature の内部に手を伸ばさない）

## 4. データフロー

### 生成（ログイン不要でも使える）

1. ブラウザが `@qrcc/wasm` で即時プレビュー（Worker を呼ばない）
2. 保存を押したときだけ `qrcc-web` の server function → `qrcc-api` へ
3. `qrcc-api` が D1 に保存する（成果物そのものは保存しない）

同じ仕様の再描画はブラウザ内の wasm で済むので、Worker も D1 も消費しない。

### 読み取り

1. カメラ: `getUserMedia` + `BarcodeDetector`（対応環境）
2. 非対応 / iOS Safari: `@qrcc/wasm` の rxing デコーダにフォールバック
3. 画像ファイル: 同じく端末側でデコード。**画像はサーバに送らない**（既定）
4. サーバ側デコードは「端末が対応していない形式」のみのフォールバック経路

### 印刷

1. ラベル印刷は `@media print` + `@page` によるブラウザ印刷が主経路（フォント問題なし）
2. PDF はスコープ外。ブラウザの「PDF として保存」に任せる（[ADR-0005](adr/0005-pdf-and-label-printing.md)）

## 5. Cloudflare リソース

| バインディング          | 用途                                        | 無料枠                                 | 想定使用量          |
| ----------------------- | ------------------------------------------- | -------------------------------------- | ------------------- |
| `DB` (D1)               | codes / folders / shares / users / sessions | 5GB, 5M rows read/day, 100k writes/day | 1 コード ≒ 1KB      |
| `ASSETS`                | 静的アセット                                | 無制限                                 | wasm もここから配信 |
| `API` (service binding) | qrcc-web → qrcc-api                         | 追加課金なし                           | —                   |

**KV と R2 は使わない**（[ADR-0009](adr/0009-stay-on-workers-free.md)）。
R2 だけは利用上限を設定できず従量課金が止められないため、有効化もしない。

予算設計と超過時の縮退は [free-tier-budget.md](free-tier-budget.md)。

## 6. 拡張点（ここを触れば機能が増える設計）

| 増やしたいもの                | 触る場所                                                                                                                                | 触らなくてよい場所   |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| symbology（新バーコード種別） | `features/generate/contract/symbology.ts` の union に 1 メンバー + `features/generate/engine/src/symbology/<name>.rs` + レジストリ 1 行 | 既存の描画・保存・UI |
| payload 種別（Wi-Fi, vCard…） | `features/generate/contract/payload.ts` の union + `features/generate/core/payload/<name>.ts`                                           | 描画エンジン         |
| ラベル台紙                    | `features/print/core/sheets/<name>.ts` に寸法定義                                                                                       | 面付けアルゴリズム   |
| 出力形式                      | `features/generate/engine/src/output/<name>.rs`                                                                                         | symbology 実装       |
| ログイン方法                  | Better Auth のプラグイン追加 + D1 マイグレーション                                                                                      | アプリ本体           |

union に足したのに実装を足していない場合、TS は Mapped Type のレジストリで、
Rust は `match` の網羅性チェックで**必ずコンパイルエラーになる**。
これが「拡張性」の実体であり、規約ではなく型で担保する。

## 7. 関連ドキュメント

- [ドメインモデル](domain-model.md)
- [API 契約（service binding RPC）](api-contract.md)
- [並行作業レーン](parallel-lanes.md)
- [アクセシビリティ方針と AAA 達成状況](accessibility.md)
- [無料枠の予算設計](free-tier-budget.md)
- [ADR 一覧](adr/)
