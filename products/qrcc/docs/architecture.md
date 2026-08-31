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
                      │  crates/qrcc-core     ドメイン           │
                      │  crates/qrcc-render   生成 (SVG/PNG)     │
                      │  crates/qrcc-decode   デコード (rxing)   │
                      │  crates/qrcc-print    PDF / ラベル面付け │
                      │  codes / folders / shares の CRUD        │
                      └────┬──────────────┬──────────────┬───────┘
                           │              │              │
                        ┌──▼──┐        ┌──▼──┐       ┌───▼───┐
                        │ D1  │        │ KV  │       │  R2   │
                        │メタ  │        │短命 │       │生成物 │
                        │データ│        │キャッシュ│    │/一時画像│
                        └─────┘        └─────┘       └───────┘
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

```
qrcc2/
├─ apps/
│  ├─ web/                 @qrcc/web   TanStack Start Worker（entry）
│  │  ├─ src/routes/       ルート（ファイルベース）
│  │  ├─ src/features/     画面機能（generate / scan / manage / print / auth）
│  │  ├─ src/server/       server functions, composition root, auth
│  │  └─ wrangler.jsonc
│  └─ api/                 qrcc-api   workers-rs Worker（auxiliary）
│     ├─ src/lib.rs        RPC エントリ + ルーティング
│     ├─ src/handlers/     render / decode / print / codes
│     └─ wrangler.jsonc
├─ crates/
│  ├─ qrcc-core/           ドメイン型・バリデーション（I/O なし・no_std 志向）
│  ├─ qrcc-render/         symbology → モジュール行列 → SVG/PNG
│  ├─ qrcc-decode/         画像 → バーコード（rxing）
│  ├─ qrcc-print/          PDF / ラベル面付け
│  └─ qrcc-wasm/           wasm-bindgen ブラウザ向けバインディング
├─ packages/
│  ├─ contracts/           @qrcc/contracts  型・Result・API 契約（実装依存ゼロ）
│  ├─ core/                @qrcc/core       純粋ドメインロジック（TS 側）
│  ├─ ui/                  @qrcc/ui         デザインシステム（a11y AAA）
│  └─ wasm/                @qrcc/wasm       qrcc-wasm のビルド成果物ラッパ
├─ e2e/                    Playwright（Large / a11y）
├─ docs/                   本ドキュメント群
├─ .agents/skills/         エージェント用スキル（.claude/skills から symlink）
└─ scripts/                wt.sh（worktree）・ビルド補助
```

依存の向き（`import/no-cycle` と Cargo で強制）:

```
ui ─┐
    ├─▶ contracts ◀─── core ◀─── web/server
web ┘                              │
                                   ▼
                            service binding
                                   │
crates: qrcc-core ◀─ render / decode / print ◀─ apps/api
                  ◀─ qrcc-wasm ─▶ packages/wasm ─▶ web (browser)
```

`contracts` は誰にも依存しない。TS と Rust の **API 契約の唯一の定義元**。

## 4. データフロー

### 生成（ログイン不要でも使える）

1. ブラウザが `@qrcc/wasm` で即時プレビュー（Worker を呼ばない）
2. 保存を押したときだけ `qrcc-web` の server function → `qrcc-api` へ
3. `qrcc-api` が D1 に保存、R2 に成果物をキャッシュ（キーは仕様のハッシュ）

同じ仕様の再生成は R2 のキャッシュヒットで D1 も CPU も使わない。

### 読み取り

1. カメラ: `getUserMedia` + `BarcodeDetector`（対応環境）
2. 非対応 / iOS Safari: `@qrcc/wasm` の rxing デコーダにフォールバック
3. 画像ファイル: 同じく端末側でデコード。**画像はサーバに送らない**（既定）
4. サーバ側デコードは「端末が対応していない形式」のみのフォールバック経路

### 印刷

1. ラベル印刷は `@media print` + `@page` によるブラウザ印刷が主経路（フォント問題なし）
2. PDF ダウンロードは `qrcc-api` の `qrcc-print` で生成（[ADR-0005](adr/0005-pdf-and-label-printing.md)）

## 5. Cloudflare リソース

| バインディング          | 用途                                                    | 無料枠                                 | 想定使用量               |
| ----------------------- | ------------------------------------------------------- | -------------------------------------- | ------------------------ |
| `DB` (D1)               | codes / folders / shares / users / sessions             | 5GB, 5M rows read/day, 100k writes/day | 1 コード ≒ 1KB           |
| `KV`                    | 共有リンク解決キャッシュ、レート制限カウンタ            | 1GB, 100k reads/day, 1k writes/day     | 書き込みが少ない用途のみ |
| `R2`                    | 生成物 (PNG/PDF) キャッシュ、アップロード画像の一時保管 | 10GB, Class A 1M/月                    | ハッシュキーで重複排除   |
| `ASSETS`                | 静的アセット                                            | 無制限                                 | wasm もここから配信      |
| `API` (service binding) | qrcc-web → qrcc-api                                     | 追加課金なし                           | —                        |

予算設計と超過時の縮退は [free-tier-budget.md](free-tier-budget.md)。

## 6. 拡張点（ここを触れば機能が増える設計）

| 増やしたいもの                | 触る場所                                                                                                         | 触らなくてよい場所   |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------- |
| symbology（新バーコード種別） | `contracts/symbology.ts` の union に 1 メンバー + `crates/qrcc-render/src/symbology/<name>.rs` + レジストリ 1 行 | 既存の描画・保存・UI |
| payload 種別（Wi-Fi, vCard…） | `contracts/payload.ts` の union + `packages/core/src/payload/<name>.ts`                                          | 描画エンジン         |
| ラベル台紙                    | `packages/core/src/print/sheets/<name>.ts` に寸法定義                                                            | 面付けアルゴリズム   |
| 出力形式                      | `crates/qrcc-render/src/output/<name>.rs`                                                                        | symbology 実装       |
| ログイン方法                  | Better Auth のプラグイン追加 + D1 マイグレーション                                                               | アプリ本体           |

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
