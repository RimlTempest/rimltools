# 型でユースケースを表現する

## Branded Primitive / ID（`unique symbol`）

素の `string` を混ぜないための最小コスト。ブランドは値としては存在しない。

```ts
declare const brand: unique symbol
type Brand<T, B> = T & { readonly [brand]: B }

export type DocumentId = Brand<string, 'DocumentId'>
export type UserId = Brand<string, 'UserId'>
export type ShareToken = Brand<string, 'ShareToken'>
```

**作り方は必ずパース関数経由**（`as` は禁止なので、唯一の生成点を型ガードで作る）。

```ts
const isDocumentId = (v: string): v is DocumentId => /^doc_[0-9a-hjkmnp-tv-z]{24}$/.test(v)

export const parseDocumentId = (v: string): Result<DocumentId, 'invalid_document_id'> =>
  isDocumentId(v) ? ok(v) : err('invalid_document_id')
```

新規発行は「生成器が返す値をそのまま型ガードに通す」。

```ts
export const newDocumentId = (
  randomBase32: () => string,
): Result<DocumentId, 'invalid_document_id'> => parseDocumentId(`doc_${randomBase32()}`)
```

### 検証済み文字列（Branded Primitive）

```ts
export type DocumentTitle = Brand<string, 'DocumentTitle'> // 1〜120 文字、改行なし
export type DisplayName = Brand<string, 'DisplayName'> // 1〜32 文字。presence に出す名前

const isDocumentTitle = (v: string): v is DocumentTitle =>
  v.length >= 1 && v.length <= 120 && !/[\r\n]/.test(v)
```

これで「タイトルを検証してから保存する」ことがシグネチャで強制される:
`renameDocument(id: DocumentId, title: DocumentTitle)` は未検証文字列を受け取れない。

---

## Discriminated Union

「種類ごとに持つデータが違う」ものはすべてこれ。optional の寄せ集めにしない。

```ts
// 同期接続の状態。UI の表示・再接続ボタンの有無がここで決まる
export type ConnectionState =
  | { readonly kind: 'connecting' }
  | { readonly kind: 'connected'; readonly since: Date }
  | { readonly kind: 'reconnecting'; readonly attempt: number; readonly nextAt: Date }
  | { readonly kind: 'offline'; readonly reason: 'network' | 'closed_by_server' }
  | { readonly kind: 'rejected'; readonly reason: 'forbidden' | 'not_found' | 'limit' }

// フォーマット診断。yaml/toml/json のパースエラーと markdown の mermaid エラーを 1 つの型で
export type Diagnostic =
  | { readonly kind: 'syntax'; readonly line: number; readonly column: number; readonly message: string }
  | { readonly kind: 'mermaid'; readonly blockIndex: number; readonly message: string }
  | { readonly kind: 'duplicate_key'; readonly line: number; readonly key: string }
```

`rejected` のときだけ `reason` が権限系である、を `Exclude`/union で表す — コメントではなく型で。

### 網羅性は `switch` + `never`

```ts
const statusLabel = (s: ConnectionState): string => {
  switch (s.kind) {
    case 'connecting':
      return '接続中'
    // ...
    default:
      return assertNever(s)
  }
}
export const assertNever = (v: never): never => {
  throw new Error(`unhandled: ${JSON.stringify(v)}`)
}
```

`assertNever` はドメイン層の外（アダプタ層）に置く。`switch-exhaustiveness-check` が
error なので、union にメンバーを足すと未対応箇所が全部落ちる。これが OCP の担保。
**`default` 節は `switch-exhaustiveness-check` を満たさない**（qrcc で確認済み）。
`default: return assertNever(s)` のように never 引数で受けるか、全ケースを列挙する。

---

## Utility Types

派生型は手書きしない。元の型が変わったら派生も自動で追随させる。

```ts
export type Document = {
  readonly id: DocumentId
  readonly ownerId: UserId
  readonly title: DocumentTitle
  readonly kind: DocumentKind // 'markdown' | 'yaml' | 'toml' | 'json'
  readonly createdAt: Date
  readonly updatedAt: Date
}

// 作成時は id と日時をサーバが決める
export type NewDocument = Omit<Document, 'id' | 'createdAt' | 'updatedAt'>
// 更新は部分適用、ただし所有者と種別は変えられない
export type DocumentPatch = Partial<Pick<Document, 'title'>>
// 一覧に必要な列だけ
export type DocumentSummary = Pick<Document, 'id' | 'title' | 'kind' | 'updatedAt'> & {
  readonly role: MemberRole
}
```

よく使うもの: `Omit` `Pick` `Partial` `Required` `Readonly` `Extract` `Exclude`
`NonNullable` `Awaited` `Parameters` `ReturnType` `Record`。

---

## Conditional / Mapped Types

「文書種別ごとにパーサ・整形・拡張子・MIME が違う」を 1 つの型関数で表す。

```ts
export type FormatSupport = {
  readonly extensions: readonly string[]
  readonly mime: string
  readonly diagnose: (text: string) => readonly Diagnostic[]
  readonly format: (text: string) => Result<string, Diagnostic>
}

// 文書種別 → フォーマット実装、を型安全に持つレジストリ
type FormatRegistry = { readonly [K in DocumentKind]: FormatSupport }

export const formats: FormatRegistry = {
  markdown: markdownSupport,
  yaml: yamlSupport,
  toml: tomlSupport,
  json: jsonSupport,
  // ここに 1 行足し忘れるとコンパイルエラー = 新種別の追加漏れを防ぐ
}
```

レジストリを Mapped Type で持つと、「union にメンバーを足したのに実装を足していない」
が必ずコンパイルエラーになる。**これが拡張性の中核**。

### テンプレートリテラル型

```ts
type HexColor = `#${string}`
type Route = `/d/${string}` | `/s/${string}` | '/' | '/sign-in'
```

---

## 迷ったときの判断表

| 症状                                    | 使うもの                   |
| --------------------------------------- | -------------------------- |
| 同じ `string` を取り違えそう            | Branded type               |
| optional が 3 個以上並ぶ                | Discriminated union に分解 |
| 「A のときだけ B が必須」               | Discriminated union        |
| 元の型に追随させたい派生型              | Utility Types              |
| 種類ごとに違う実装/設定を全部そろえたい | Mapped Type のレジストリ   |
| 失敗しうる変換                          | `Result` を返すパース関数  |
