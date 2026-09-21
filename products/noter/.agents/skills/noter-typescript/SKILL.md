---
name: noter-typescript
description: noter の TypeScript コーディング規約。TS/TSX を書く・直す・レビューする前に必ず読む。any/as/class/enum/! を禁止し、Result・Branded 型・discriminated union・Utility/Conditional Types でユースケースを型に落とし込み、依存は関数引数で注入する。「型が決まらない」「as で通した」「クラスにするか迷う」「エラーをどう返すか」「モックできない」ときに発火。
---

# noter TypeScript 規約

型でユースケースを表現し、実行時に「起こりえない状態」をコンパイル時に消す。
ここに書かれた禁止事項は `.oxlintrc.json` の `noter/*` ルールで機械的に強制される。
lint が落ちたら回避するのではなく、設計を直す。

## 0. まずこれだけ

| やること                                  | やらないこと                                   |
| ----------------------------------------- | ---------------------------------------------- |
| `Result<T, E>` を返す                     | ドメインで `throw` する                        |
| 型ガード / 判別可能ユニオンで絞る         | `as` でねじ伏せる                              |
| ファクトリ関数 + クロージャ               | `class`                                        |
| `const X = {...} as const` + 値のユニオン | `enum`                                         |
| 引数で依存を受け取る                      | モジュールスコープで import した実体を直接呼ぶ |
| `unknown` + パース                        | `any`                                          |

## 1. 禁止事項と代替

### `any` 禁止

外部入力は `unknown` で受けて **パース関数**で境界を越えさせる。パース関数は
`(input: unknown) => Result<T, ParseError>` を返す。詳細は
[references/result.md](references/result.md)。

### `as` 禁止（`as const` のみ許可）

- 絞り込みは型ガード（`value is T`）か判別可能ユニオンの `switch`。
- オブジェクトリテラルの型検査は `satisfies` を使う（`as` ではない）。
- `!`（non-null assertion）も禁止。`undefined` の場合を必ず書く。

### `class` 禁止

状態と振る舞いはファクトリ関数 + クロージャで表す。継承ではなく合成。
`interface` ではなく `type` を使う（宣言マージによる暗黙拡張を避ける）。
詳細は [references/function-di.md](references/function-di.md)。

### `enum` 禁止

```ts
const DocumentKind = { markdown: 'markdown', yaml: 'yaml', toml: 'toml', json: 'json' } as const
type DocumentKind = (typeof DocumentKind)[keyof typeof DocumentKind]
```

### `default export` 禁止（設定ファイル・ルートファイルを除く）

名前付き export のみ。リネーム時の追跡性とツリーシェイクのため。

## 2. 型でユースケースを表現する

4 つの道具を使い分ける。判断表とコード例は
[references/type-patterns.md](references/type-patterns.md)。

| 道具                           | 使いどころ                                                      |
| ------------------------------ | --------------------------------------------------------------- |
| Branded type (`unique symbol`) | ID・検証済み文字列。`DocumentId` と `UserId` を取り違えられなくする |
| Discriminated union            | 「状態」「種類」。文書種別・接続状態・診断結果・UI state                  |
| Utility Types                  | 既存型からの派生（`Omit`/`Pick`/`Readonly`/`Extract`）          |
| Conditional / Mapped Types     | 種類ごとに異なるオプションを 1 つの型関数で表す                 |

**原則: 不正な状態を表現できない型にする。**
「`kind: 'reconnecting'` のときだけ `attempt` がある」なら、フラットな
optional ではなく union のメンバーとして持つ。

## 3. エラーは値。`Result<T, E>`

ドメイン層（`features/<name>/core`, `shared/contract`）では `throw` 禁止
（`noter/no-throw-in-domain`）。失敗は戻り値で表す。

```ts
type Result<T, E> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E }
```

- `E` は必ず判別可能ユニオン。文字列やエラーメッセージではなく **タグ付きの構造体**。
- `throw` は「呼び出し側が回復できないバグ」だけ。境界（HTTP ハンドラ、
  React の error boundary）で `Result` を例外/レスポンスに変換する。
- 詳細と実装は [references/result.md](references/result.md)。

## 4. 依存は関数引数で注入する（DIP）

```ts
type Deps = {
  readonly now: () => Date
  readonly insertDocument: (d: Document) => Promise<Result<void, RepoError>>
}
export const createDocument =
  (deps: Deps) =>
  async (input: NewDocument): Promise<Result<Document, CreateError>> => {
    /* ... */
  }
```

- ユースケース関数は「依存 → 入力 → 結果」の 2 段カリー化。
- 依存の型は **利用側が定義する**（ISP）。実装側の型を import しない。
- 配線は composition root（`features/<name>/ui/*-wiring.route.ts` と `apps/sync/src/index.ts`）だけ。
- テストではプレーンなオブジェクトを渡す。モックライブラリは不要。
- 詳細は [references/function-di.md](references/function-di.md)。

## 5. SOLID / KISS / YAGNI / DRY の運用

- **SRP**: 1 ファイル = 1 ユースケースまたは 1 概念。exportが増えたら分割の合図。
- **OCP**: 新しい文書種別（フォーマット）の追加が「新ファイル + レジストリに 1 行」で済むこと。
  既存の `switch` を触らないと追加できない設計なら直す。
- **LSP/ISP**: 型は狭く。`Deps` に使わないメンバーを入れない。
- **DIP**: 上記 4。
- **KISS**: 抽象は「2 回目の重複」まで導入しない。
- **YAGNI**: 「将来使うかも」のオプション引数・設定項目を作らない。
- **DRY**: 重複は **知識**の重複だけを消す。形が似ているだけのコードは消さない。

## 6. モジュール境界

```
shared/contract           … 型と Result のみ。実装依存ゼロ。誰からも import される
features/<name>/contract  … その feature の公開型と Result（実装依存ゼロ）
features/<name>/core      … 純粋ドメインロジック。I/O 禁止。Yjs のような純粋ライブラリは可
features/<name>/server    … D1 / Better Auth を触るサーバ側アダプタ
features/sync/worker      … Durable Object アダプタ（唯一 class を許す場所）
apps/*/src/server   … I/O（D1・Durable Object binding）と composition root
features/<name>/ui    … UI。ドメイン型をそのまま使う。`*.route.tsx` だけが env に触れてよい
```

`import/no-cycle` は error。feature 同士は `@noter/<name>/<subpath>` の公開サブパス経由でのみ依存する（相対パスで隣の feature に手を伸ばさない）。

## 7. レビュー用チェックリスト

コードを書き終えたら [references/checklist.md](references/checklist.md) を通す。
