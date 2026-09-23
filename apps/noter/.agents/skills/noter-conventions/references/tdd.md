# noter のテスト固有事項

共通の規約は `rimltools-tdd`。ここには noter のツール・置き場所・手法を置く（統合前の `noter-tdd` から移した）。

## テストサイズ（noter のツール）

| サイズ     | 依存してよいもの                                                          | 目標時間     | ツール                  | 置き場所                     |
| ---------- | ------------------------------------------------------------------------- | ------------ | ----------------------- | ---------------------------- |
| **Small**  | 自プロセスのメモリのみ。I/O・時計・乱数・ネットワーク禁止（すべて注入）   | < 100ms / 件 | `bun test`              | 実装の隣 `*.test.ts(x)`      |
| **Medium** | localhost 内のプロセス。`bun:sqlite` に実マイグレーション、happy-dom      | < 5s / 件    | `bun test`              | 実装の隣 `*.test.ts(x)`      |
| **Large**  | 実ブラウザ、実 Worker（Miniflare の DO を含む）、複数タブの同時編集       | < 60s / 件   | Playwright              | `e2e/`                       |

## Yjs は Small で使ってよい

**Yjs は純粋ライブラリ**なので Small で使ってよい。`new Y.Doc()` を 2 つ作り、
片方の update をもう片方に `Y.applyUpdate` すれば「同期して収束する」を
ネットワークなしで検証できる。

## 境界値（noter）

- 空文書、最大サイズ（`MAX_DOCUMENT_BYTES`）ちょうど / +1、不正 UTF-8、深いネスト（yaml/json）、重複キー、mermaid ブロックが 0 個 / 複数個。
- `ConnectionState` の全 kind で status 表示が出ることを表駆動で確認する。

## 収束テスト（同期）

同時編集の正しさは「**順序を入れ替えても最終状態が一致する**」で検証する。

```ts
test('2 人が同じ位置に同時挿入しても両者の文書が一致する', () => {
  const a = new Y.Doc()
  const b = new Y.Doc()
  a.getText('content').insert(0, 'hello')
  const ua = Y.encodeStateAsUpdate(a)
  Y.applyUpdate(b, ua)
  a.getText('content').insert(5, ' A')
  b.getText('content').insert(5, ' B')
  const fromA = Y.encodeStateAsUpdate(a)
  const fromB = Y.encodeStateAsUpdate(b)
  Y.applyUpdate(b, fromA)
  Y.applyUpdate(a, fromB)
  expect(a.getText('content').toString()).toBe(b.getText('content').toString())
})
```

## Durable Object の Room ロジック

`features/sync/core` の `makeRoom` は **storage / sockets / now を注入**して Small で回す。
`sockets` はメッセージを配列に貯めるだけのフェイク、`storage` は `Map` ベース。
「viewer からの update は無視される」「alarm で 1 行だけ書く」「wake 後に状態を復元する」
をここで全部検証する。DO の class（`features/sync/worker`）はテストしない
（1〜3 行の委譲だけ。Large で結合を見る）。

## レイヤ別の指針（noter）

| 対象                                        | サイズ     | 方針                                                        |
| ------------------------------------------- | ---------- | ----------------------------------------------------------- |
| `features/<name>/core`, `*/contract`        | Small のみ | 純粋関数。フェイクは素のオブジェクト                        |
| `features/formats/core`                     | Small      | 入力文字列 → 診断/整形結果。フィクスチャは `fixtures/`      |
| ユースケース関数 (`makeXxx`)                | Small      | 依存はインメモリのフェイク実装                              |
| D1 リポジトリ (`features/*/server`)         | Medium     | `bun:sqlite` に `services/web/migrations/*.sql` を当てて検証    |
| Better Auth まわり                          | Medium     | `bun:sqlite` + `recordingClient`（fetch のフェイク）        |
| `features/sync/client`（provider）          | Small      | WebSocket をフェイク（`send` を配列に貯める）。再接続の backoff は `now` 注入 |
| React コンポーネント                        | Small      | Testing Library。ロールとアクセシブル名で取得する           |
| CodeMirror を含む画面                       | Large      | happy-dom では動かない。Playwright で実ブラウザ             |
| 複数人の同時編集・再接続・deploy 後の復帰   | Large      | Playwright の 2 コンテキストで同じ文書を開く                |
| アクセシビリティ                            | Large      | Playwright + `@axe-core/playwright`（AAA タグ込み）         |

## 不安定なテストを作らない（noter）

- 同期テストでは「相手の文書が特定の文字列になる」を `expect.poll` で待つ。
- Large では**文書をテストごとに新規作成**する（共有 DO の状態を引き継がない）。

## コマンド（apps/noter 直下）

```
bun run test                        # 全ワークスペースの Small/Medium
bun test features/<name>/core       # Small だけ高速に回す
bun test features/sync              # Room ロジック + provider
bun run e2e                         # Large (Playwright; DO は Miniflare で起動)
bun run a11y                        # Large (axe-core, AAA)
```
