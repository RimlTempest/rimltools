---
name: noter-tdd
description: noter のテスト規約。機能追加・バグ修正の実装を書き始める前に読む。必ず失敗するテストから始め(red→green→refactor)、テストサイズ(Small/Medium/Large)を意識して置き場所とツールを選ぶ。「テストをどこに置くか」「何をモックするか」「Durable Object / WebSocket / D1 / CodeMirror / Yjs をどうテストするか」「遅い・不安定なテスト」で発火。
---

# noter テスト規約

## 1. red → green → refactor を飛ばさない

1. **red**: 失敗するテストを書く。実行して**期待どおりに失敗すること**を確認する
   （通ってしまうテストは何も検証していない）。
2. **green**: 通す最小の実装。ここで設計を凝らない。
3. **refactor**: テストが緑のまま構造を直す。ここで初めて抽象を入れる。

バグ修正も同じ。**再現するテストを先に書く**。修正前にそのテストが落ちること、
修正後に通ることの両方を確認する。

コミットは red→green→refactor をまたいで 1 つでよいが、
「テストなしの実装コミット」は作らない。

## 2. テストサイズ

サイズは「速さ」ではなく **何に依存してよいか** で決まる。

| サイズ     | 依存してよいもの                                                          | 目標時間     | ツール                  | 置き場所                     |
| ---------- | ------------------------------------------------------------------------- | ------------ | ----------------------- | ---------------------------- |
| **Small**  | 自プロセスのメモリのみ。I/O・時計・乱数・ネットワーク禁止（すべて注入）   | < 100ms / 件 | `bun test`              | 実装の隣 `*.test.ts(x)`      |
| **Medium** | localhost 内のプロセス。`bun:sqlite` に実マイグレーション、happy-dom      | < 5s / 件    | `bun test`              | 実装の隣 `*.test.ts(x)`      |
| **Large**  | 実ブラウザ、実 Worker（Miniflare の DO を含む）、複数タブの同時編集       | < 60s / 件   | Playwright              | `e2e/`                       |

**比率の目安 70 : 20 : 10。** Medium/Large が増えてきたら、依存が注入されて
いないサインなので設計を直す。

### Small に落とすための道具

`features/<name>/core` は I/O を一切持たないので全部 Small で書ける。
時計・乱数・ID 生成・storage は必ず引数で受け取る（`noter-typescript` の関数DI）。

```ts
const createDocument = makeCreateDocument({
  now: () => new Date('2026-09-01T00:00:00Z'),
  newId: () => parseDocumentId('doc_000000000000000000000001'),
  insertDocument: async (d) => {
    saved.push(d)
    return ok(undefined)
  },
})
```

**Yjs は純粋ライブラリ**なので Small で使ってよい。`new Y.Doc()` を 2 つ作り、
片方の update をもう片方に `Y.applyUpdate` すれば「同期して収束する」を
ネットワークなしで検証できる。

## 3. 何をテストするか

- **振る舞いをテストし、実装をテストしない。** 関数の戻り値・保存された値・
  描画された DOM を検証する。内部の呼び出し回数を数えない。
- **境界値を必ず入れる**: 空文書、最大サイズ（`MAX_DOCUMENT_BYTES`）ちょうど / +1、
  不正 UTF-8、深いネスト（yaml/json）、重複キー、mermaid ブロックが 0 個 / 複数個。
- **Result のエラー枝を必ずテストする。** `ok` だけのテストは半分しか書いていない。
- 網羅は「union のメンバーごと」に取る。`DocumentKind` を足したら、そのテストも足す。
  `ConnectionState` の全 kind で status 表示が出ることを表駆動で確認する。

### 収束テスト（同期）

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

### Durable Object の Room ロジック

`features/sync/core` の `makeRoom` は **storage / sockets / now を注入**して Small で回す。
`sockets` はメッセージを配列に貯めるだけのフェイク、`storage` は `Map` ベース。
「viewer からの update は無視される」「alarm で 1 行だけ書く」「wake 後に状態を復元する」
をここで全部検証する。DO の class（`features/sync/worker`）はテストしない
（1〜3 行の委譲だけ。Large で結合を見る）。

## 4. レイヤ別の指針

| 対象                                        | サイズ     | 方針                                                        |
| ------------------------------------------- | ---------- | ----------------------------------------------------------- |
| `features/<name>/core`, `*/contract`        | Small のみ | 純粋関数。フェイクは素のオブジェクト                        |
| `features/formats/core`                     | Small      | 入力文字列 → 診断/整形結果。フィクスチャは `fixtures/`      |
| ユースケース関数 (`makeXxx`)                | Small      | 依存はインメモリのフェイク実装                              |
| D1 リポジトリ (`features/*/server`)         | Medium     | `bun:sqlite` に `apps/web/migrations/*.sql` を当てて検証    |
| Better Auth まわり                          | Medium     | `bun:sqlite` + `recordingClient`（fetch のフェイク）        |
| `features/sync/client`（provider）          | Small      | WebSocket をフェイク（`send` を配列に貯める）。再接続の backoff は `now` 注入 |
| React コンポーネント                        | Small      | Testing Library。ロールとアクセシブル名で取得する           |
| CodeMirror を含む画面                       | Large      | happy-dom では動かない。Playwright で実ブラウザ             |
| 複数人の同時編集・再接続・deploy 後の復帰   | Large      | Playwright の 2 コンテキストで同じ文書を開く                |
| アクセシビリティ                            | Large      | Playwright + `@axe-core/playwright`（AAA タグ込み）         |

### React コンポーネントの取得方法

```ts
screen.getByRole('button', { name: '共有' }) // ○ 支援技術と同じ経路で取る
screen.getByTestId('share-button') // × 最後の手段
```

ロールとアクセシブル名で取れないなら、それはアクセシビリティのバグ。
テストを緩めるのではなくマークアップを直す。

## 5. 不安定なテストを作らない

- `sleep` を書かない。状態が変わるのを待つ（`waitFor` / `expect.poll`）。
  同期テストでは「相手の文書が特定の文字列になる」を `expect.poll` で待つ。
- 現在時刻・乱数・`crypto.randomUUID` を直接呼ばない（注入する）。
- テスト間で状態を共有しない。D1 は各テストでマイグレーションを張り直す。
  Large では**文書をテストごとに新規作成**する（共有 DO の状態を引き継がない）。
- 並列実行前提で書く（`bun test` は既定で並列）。

flaky を見つけたら **skip せずその日のうちに直す**。skip したテストは
存在しないテストと同じ。

## 6. カバレッジの扱い

カバレッジは目標ではなく**穴の検出器**。`bun test --coverage` の結果を見て、
「エラー枝が通っていない」「union のメンバーが未テスト」を探す。
数値目標を満たすためのテストを書かない。

## 7. コマンド

```
bun run test                        # 全ワークスペースの Small/Medium
bun test features/<name>/core       # Small だけ高速に回す
bun test features/sync              # Room ロジック + provider
bun run e2e                         # Large (Playwright; DO は Miniflare で起動)
bun run a11y                        # Large (axe-core, AAA)
```
