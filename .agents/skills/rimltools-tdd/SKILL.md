---
name: rimltools-tdd
description: RimlTools（qrcc・noter ほか全プロダクト共通）のテスト規約。機能追加・バグ修正の実装を書き始める前に読む。必ず失敗するテストから始め(red→green→refactor)、テストサイズ(Small/Medium/Large)を意識して置き場所とツールを選ぶ。「テストをどこに置くか」「何をモックするか」「Worker/D1/Durable Object/WebSocket/カメラ/WASM をどうテストするか」「遅い・不安定なテスト」で発火。
---

# RimlTools テスト規約

全プロダクト共通。プロダクト固有のツール・置き場所・テスト手法（qrcc のゴールデンテストと
Rust、noter の収束テストと Room ロジック）は `<tool>-conventions` の `references/tdd.md`。

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

| サイズ     | 依存してよいもの                                                        | 目標時間     | 既定のツール / 置き場所          |
| ---------- | ----------------------------------------------------------------------- | ------------ | -------------------------------- |
| **Small**  | 自プロセスのメモリのみ。I/O・時計・乱数・ネットワーク禁止（すべて注入） | < 100ms / 件 | `bun test`、実装の隣 `*.test.ts(x)` |
| **Medium** | localhost 内のプロセス（ローカル DB・WASM ロード・DOM 実装）            | < 5s / 件    | プロダクトごと（`<tool>-conventions`） |
| **Large**  | 実ブラウザ、実 Worker、複数コンポーネント結合                           | < 60s / 件   | Playwright、`e2e/`               |

**比率の目安 70 : 20 : 10。** Medium/Large が増えてきたら、依存が注入されて
いないサインなので設計を直す。

### Small に落とすための道具

`features/<name>/core` は I/O を一切持たないので全部 Small で書ける。
時計・乱数・ID 生成・storage は必ず引数で受け取る（`rimltools-typescript` の関数DI）。

```ts
// 例（qrcc）
const createCode = makeCreateCode({
  now: () => new Date('2026-09-01T00:00:00Z'),
  newId: () => parseCodeId('cd_000000000000000000000001'),
  insertCode: async (c) => {
    saved.push(c)
    return ok(undefined)
  },
})
```

## 3. 何をテストするか

- **振る舞いをテストし、実装をテストしない。** 関数の戻り値・保存された値・
  描画された DOM を検証する。内部の呼び出し回数を数えない。
- **境界値を必ず入れる**: 空・0・上限ちょうど・上限 +1・不正な入力。
  プロダクト別の具体的な境界値は `<tool>-conventions`。
- **Result のエラー枝を必ずテストする。** `ok` だけのテストは半分しか書いていない。
- 網羅は「union のメンバーごと」に取る。種類（qrcc の symbology、noter の `DocumentKind` など）を足したら、そのテストも足す。

## 4. レイヤ別の指針

| 対象                                      | サイズ     | 方針                                                |
| ----------------------------------------- | ---------- | --------------------------------------------------- |
| `*/contract`, `features/<name>/core`      | Small のみ | 純粋関数。フェイクは素のオブジェクト                |
| ユースケース関数 (`makeXxx`)              | Small      | 依存はインメモリのフェイク実装                      |
| D1 リポジトリ                             | Medium     | 実マイグレーションを当てたローカル DB で検証        |
| React コンポーネント                      | Small      | Testing Library。ロールとアクセシブル名で取得する   |
| アクセシビリティ                          | Large      | Playwright + `@axe-core/playwright`（AAA タグ込み） |

プロダクト固有の対象（qrcc の engine・API ルート・カメラ・印刷、noter の DO・同期・CodeMirror）は
`<tool>-conventions` の `references/tdd.md`。

### React コンポーネントの取得方法

```ts
screen.getByRole('button', { name: '保存' }) // ○ 支援技術と同じ経路で取る
screen.getByTestId('save-button') // × 最後の手段
```

ロールとアクセシブル名で取れないなら、それはアクセシビリティのバグ。
テストを緩めるのではなくマークアップを直す。

## 5. 不安定なテストを作らない

- `sleep` を書かない。状態が変わるのを待つ（`waitFor` / `expect.poll`）。
- 現在時刻・乱数・`crypto.randomUUID` を直接呼ばない（注入する）。
- テスト間で状態を共有しない。D1 は各テストでマイグレーションを張り直す。
- Large ではテストごとにデータを新規作成し、前のテストの状態を引き継がない。
- 並列実行前提で書く（`bun test` も `cargo test` も既定で並列）。

flaky を見つけたら **skip せずその日のうちに直す**。skip したテストは
存在しないテストと同じ。

## 6. カバレッジの扱い

カバレッジは目標ではなく**穴の検出器**。`bun test --coverage`（Rust は `cargo llvm-cov`）の結果を見て、
「エラー枝が通っていない」「union のメンバーが未テスト」を探す。
数値目標を満たすためのテストを書かない。

## 7. コマンド

```
bun run test                        # ルートから: 全プロダクト + scripts/packages の Small/Medium
bun run --cwd apps/<tool> test  # 1 プロダクトだけ
bun test features/<name>/core       # （プロダクト直下で）Small だけ高速に回す
bun run a11y                        # Large (axe-core, AAA)
```

プロダクト固有のコマンド（Rust、Miniflare の結合テスト、e2e）は `<tool>-conventions`。
