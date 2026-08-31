---
name: qrcc-architecture
description: qrcc2 の構成と拡張手順。どこに何を置くか迷ったとき、機能を追加するとき、Worker 間の境界や無料枠の制約に関わる変更をするときに読む。symbology / payload 種別 / ラベル台紙 / 出力形式 / ログイン方法の追加レシピと、越えてはいけない境界を定義する。「どのパッケージに置く」「Rust と TS どちらでやる」「D1 に列を足す」「新しいバーコードを対応させたい」で発火。
---

# qrcc2 の構成と拡張

全体像は [docs/architecture.md](../../../docs/architecture.md)、
決定の理由は [docs/adr/](../../../docs/adr/) にある。ここは**手を動かす手順**。

## 1. 置き場所の判断

| 書こうとしているもの               | 置き場所                                                  |
| ---------------------------------- | --------------------------------------------------------- |
| 型・API 契約・`Result`             | `packages/contracts` （実装依存ゼロ。誰もが import する） |
| I/O のない TS ロジック             | `packages/core`                                           |
| 生成・デコード・PDF のアルゴリズム | `crates/qrcc-*`（Rust）                                   |
| D1 / R2 / KV に触るコード          | `apps/api`（Rust）または `apps/web/src/server`            |
| 画面                               | `apps/web/src/features/<feature>`                         |
| 再利用する UI 部品                 | `packages/ui`                                             |
| ブラウザで動かす Rust              | `crates/qrcc-wasm` → `packages/wasm`                      |

**判断基準**: 「計算」は Rust、「配線と画面」は TypeScript。
迷ったら計算を Rust に寄せる（CPU 10ms 制限とブラウザ実行の両方で効く）。

## 2. 越えてはいけない境界

- `packages/contracts` は**何にも依存しない**。ここに実装を書かない。
- `packages/core` と `crates/qrcc-core|render|decode|print` に **I/O を書かない**。
  時計・乱数・fetch・ストレージはすべて引数で受け取る。
- `crates/qrcc-core|render|decode|print` は `worker` crate に依存しない
  （ブラウザ向けビルドが壊れる）。
- `apps/api` の `wrangler.jsonc` に **`routes` を追加しない**。
  公開すると認可が二重になり、権限昇格の穴になる（[ADR-0002](../../../docs/adr/0002-auxiliary-worker-split.md)）。
- UI から `env` や service binding を直接触らない。必ず composition root 経由。

CI の `guard` ジョブがこれらを検査する。

## 3. 拡張レシピ

### 新しい symbology を追加する（例: MaxiCode）

1. `packages/contracts/src/symbology.ts` の `Symbology` union に
   `{ kind: 'maxicode'; mode: MaxicodeMode; … }` を足す
2. → **ここで TS も Rust もコンパイルエラーになる**。以下を潰していく:
   - `packages/contracts/src/symbology-meta.ts` のレジストリ（Mapped Type）に
     表示名・既定値・対応 payload を追加
   - `crates/qrcc-render/src/symbology/maxicode.rs` を新規作成し、
     `mod.rs` の `match` に 1 アーム追加
   - `crates/qrcc-decode` は rxing が対応していれば feature フラグを足すだけ
3. `crates/qrcc-render/src/symbology/maxicode.rs` にゴールデンテストを書く
   （既知の入力 → 既知のモジュール行列）
4. UI は自動で選択肢に出る（レジストリを引いて描画しているため）

**既存の `switch` / `match` を「触らなくても動く」ようにはしない。**
逆に、触らないと**コンパイルが通らない**ようにするのが本プロジェクトの設計。
追加漏れを型で検出するほうが、拡張ポイントを増やすより安全で単純。

### 新しい payload 種別を追加する（例: 決済コード）

1. `packages/contracts/src/payload.ts` の `CodePayload` union にメンバー追加
2. `packages/core/src/payload/<kind>.ts` に `encode` / `parse` / `describe` を実装
3. `packages/core/src/payload/registry.ts`（Mapped Type）に 1 行追加
4. `apps/web/src/features/generate/payload-forms/<kind>.tsx` にフォームを追加
   （フォームもレジストリ引き）
5. Small テスト: 正常系・境界値・エンコード後にデコードして元に戻ること

### 新しいラベル台紙を追加する

`packages/core/src/print/sheets/<vendor>-<model>.ts` に `LabelSheet` を 1 つ
export し、`sheets/index.ts` に追加するだけ。面付けアルゴリズムも CSS も
PDF ジェネレータも変更不要（[ADR-0005](../../../docs/adr/0005-pdf-and-label-printing.md)）。

### 新しい出力形式を追加する（例: EPS）

`crates/qrcc-render/src/output/<name>.rs` に
`fn render(matrix: &Matrix, style: &RenderStyle) -> Result<Vec<u8>, RenderError>`
を実装し、`output/mod.rs` の `match` に追加。`OutputFormat` union にも追加。

### 新しいログイン方法を追加する

Better Auth のプラグインを `apps/web/src/server/auth.ts` に追加し、
必要なら `apps/api/migrations/` にマイグレーションを 1 本足す。
アプリ本体のコードは変更しない（[ADR-0004](../../../docs/adr/0004-auth-guest-and-google.md)）。

### D1 に列を足す

1. `apps/api/migrations/NNNN_<説明>.sql` を**追加**する（既存を編集しない）
2. 読み出し側のパース関数を更新し、**古い行でも壊れない**ようにする
   （新列は必ず nullable かデフォルト付き）
3. ロールバック SQL は書かない（前方移行のみ運用）

## 4. 無料枠に効く変更かを毎回確認する

新機能を足すときは [docs/free-tier-budget.md](../../../docs/free-tier-budget.md) の
表に照らして、次を自問する。

- この操作は Worker リクエストを増やすか？ → ブラウザ側（`@qrcc/wasm`）でできないか
- KV に書き込むか？ → **1,000 回/日しかない**。D1 か Cache API で足りないか
- D1 の行読み取りを増やすか？ → 一覧に列を足すより JSON 列に入れられないか
- R2 に新しいオブジェクトを作るか？ → `SpecHash` で重複排除されるか

答えが「増える」なら、`docs/free-tier-budget.md` の縮退表にも行を足す。

## 5. Worker 間の RPC 契約

`qrcc-web` → `qrcc-api` の呼び出しは
[docs/api-contract.md](../../../docs/api-contract.md) が唯一の定義。
TS 側の型は `packages/contracts/src/api/`、Rust 側は
`crates/qrcc-core/src/api/`。**同じフィクスチャ JSON を両側のテストが読む**
ことで乖離を検出する（`packages/contracts/fixtures/`）。

契約を変えるときは:

1. `docs/api-contract.md` を先に更新
2. フィクスチャを追加（この時点で両側のテストが落ちる = red）
3. Rust → TS の順に実装

## 6. 迷ったら

- 抽象を足すか迷ったら足さない（YAGNI）。2 回目の重複が出てから。
- Rust か TS か迷ったら Rust（計算なら）。
- サーバかブラウザか迷ったらブラウザ（無料枠を消費しないため）。
- 型で表すか実行時検証か迷ったら型。ただし組み合わせ爆発するときだけ実行時検証。
