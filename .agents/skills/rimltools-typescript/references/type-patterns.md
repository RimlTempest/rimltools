# 型でユースケースを表現する

## Branded Primitive / ID（`unique symbol`）

素の `string` を混ぜないための最小コスト。ブランドは値としては存在しない。

```ts
declare const brand: unique symbol
type Brand<T, B> = T & { readonly [brand]: B }

export type CodeId = Brand<string, 'CodeId'>
export type UserId = Brand<string, 'UserId'>
export type ShareToken = Brand<string, 'ShareToken'>
```

**作り方は必ずパース関数経由**（`as` は禁止なので、唯一の生成点を型ガードで作る）。

```ts
const isCodeId = (v: string): v is CodeId => /^cd_[0-9a-z]{24}$/.test(v)

export const parseCodeId = (v: string): Result<CodeId, 'invalid_code_id'> =>
  isCodeId(v) ? ok(v) : err('invalid_code_id')
```

新規発行は「生成器が返す値をそのまま型ガードに通す」。

```ts
export const newCodeId = (random: () => string): Result<CodeId, 'invalid_code_id'> =>
  parseCodeId(`cd_${random()}`)
```

### 検証済み文字列（Branded Primitive）

```ts
export type NonEmptyText = Brand<string, 'NonEmptyText'>
export type HttpUrl = Brand<string, 'HttpUrl'>

const isHttpUrl = (v: string): v is HttpUrl =>
  URL.canParse(v) && /^https?:$/.test(new URL(v).protocol)
```

これで「URL を検証してから使う」ことがシグネチャで強制される:
`renderUrlCode(url: HttpUrl)` は未検証文字列を受け取れない。

---

## Discriminated Union

「種類ごとに持つデータが違う」ものはすべてこれ。optional の寄せ集めにしない。

```ts
export type Symbology =
  | {
      readonly kind: 'qr'
      readonly ec: ErrorCorrection
      readonly version: QrVersion
      readonly mask: QrMask
    }
  | {
      readonly kind: 'micro_qr'
      readonly ec: Exclude<ErrorCorrection, 'H'>
      readonly version: MicroQrVersion
    }
  | { readonly kind: 'data_matrix'; readonly shape: 'square' | 'rectangle' }
  | { readonly kind: 'pdf417'; readonly columns: Pdf417Columns; readonly ec: Pdf417Ec }
  | { readonly kind: 'aztec'; readonly ecPercent: AztecEcPercent }
  | { readonly kind: 'code128'; readonly charset: 'auto' | 'a' | 'b' | 'c' }
  | { readonly kind: 'ean13'; readonly addOn: Ean13AddOn | undefined }
```

`micro_qr` が `H` を取れないことを `Exclude` で表す — コメントではなく型で。

### 網羅性は `switch` + `never`

```ts
const renderer = (s: Symbology): Renderer => {
  switch (s.kind) {
    case 'qr':
      return qrRenderer(s)
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

---

**`default` 節は `switch-exhaustiveness-check` を満たさない**（qrcc・noter で確認済み）。
`default: return assertNever(s)` のように never 引数で受けるか、全ケースを列挙する。

## Utility Types

派生型は手書きしない。元の型が変わったら派生も自動で追随させる。

```ts
export type Code = {
  readonly id: CodeId
  readonly ownerId: UserId
  readonly name: NonEmptyText
  readonly payload: CodePayload
  readonly symbology: Symbology
  readonly style: RenderStyle
  readonly createdAt: Date
  readonly updatedAt: Date
}

// 作成時は id と日時をサーバが決める
export type NewCode = Omit<Code, 'id' | 'createdAt' | 'updatedAt'>
// 更新は部分適用、ただし所有者は変えられない
export type CodePatch = Partial<Omit<Code, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>>
// 一覧に必要な列だけ
export type CodeSummary = Pick<Code, 'id' | 'name' | 'symbology' | 'updatedAt'>
```

よく使うもの: `Omit` `Pick` `Partial` `Required` `Readonly` `Extract` `Exclude`
`NonNullable` `Awaited` `Parameters` `ReturnType` `Record`。

---

## Conditional / Mapped Types

「symbology ごとに設定項目が違う」を 1 つの型関数で表す。

```ts
type OptionsOf<K extends Symbology['kind']> = Extract<Symbology, { kind: K }>

// symbology の種類 → デフォルト値、を型安全に持つレジストリ
type Defaults = { readonly [K in Symbology['kind']]: OptionsOf<K> }

export const defaults: Defaults = {
  qr: { kind: 'qr', ec: 'M', version: 'auto', mask: 'auto' },
  // ここに 1 行足し忘れるとコンパイルエラー = 新 symbology の追加漏れを防ぐ
}
```

レジストリを Mapped Type で持つと、「union にメンバーを足したのに実装を足していない」
が必ずコンパイルエラーになる。**これが拡張性の中核**。

### テンプレートリテラル型

```ts
type HexColor = `#${string}`
type Route = `/codes/${string}` | '/codes' | '/scan' | '/print'
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
