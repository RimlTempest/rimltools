/**
 * シンボル体系と、その体系固有の設定。
 *
 * Rust 側の定義は `features/generate/engine/src/symbology.rs`。
 * ワイヤ形式（serde の tag = "kind"）が一致していることは
 * `features/generate/contract/conformance.test.ts` が担保する。
 */
export type QrErrorCorrection = 'L' | 'M' | 'Q' | 'H'
export type Code128Charset = 'auto' | 'a' | 'b' | 'c'

export type Symbology =
  | { readonly kind: 'qr'; readonly ec: QrErrorCorrection }
  | { readonly kind: 'code128'; readonly charset: Code128Charset }
  | { readonly kind: 'ean13' }

export type SymbologyKind = Symbology['kind']

/** 種類から、その種類のメンバー型を取り出す。 */
export type SymbologyOf<K extends SymbologyKind> = Extract<Symbology, { kind: K }>

type SymbologyMeta<K extends SymbologyKind> = {
  readonly label: string
  readonly description: string
  /** 1D か。UI の設定項目（バー高さ・数字表示）の出し分けに使う。 */
  readonly oneDimensional: boolean
  /** 規格が求める静寂域（モジュール数）。 */
  readonly quietZone: number
  /** 何も選んでいないときの既定値。 */
  readonly defaults: SymbologyOf<K>
  /** 入力欄のプレースホルダに使う実例。 */
  readonly example: string
}

/**
 * 種類ごとのメタ情報。**Mapped Type なので、`Symbology` にメンバーを足して
 * ここに 1 行足し忘れるとコンパイルエラーになる。**
 * これが「拡張性」の実体で、規約ではなく型が追加漏れを止める。
 */
export const SYMBOLOGY_META: { readonly [K in SymbologyKind]: SymbologyMeta<K> } = {
  qr: {
    label: 'QR コード',
    description: '日本語も URL も入る 2 次元コード。誤り訂正レベルを選べます。',
    oneDimensional: false,
    quietZone: 4,
    defaults: { kind: 'qr', ec: 'M' },
    example: 'https://example.com',
  },
  code128: {
    label: 'Code 128',
    description: '英数字を高密度で表せる 1 次元バーコード。物流や在庫でよく使われます。',
    oneDimensional: true,
    quietZone: 10,
    defaults: { kind: 'code128', charset: 'auto' },
    example: 'ABC-12345',
  },
  ean13: {
    label: 'EAN-13 / JAN',
    description: '商品識別に使う 13 桁のバーコード。12 桁を入れると検査数字を計算します。',
    oneDimensional: true,
    quietZone: 9,
    defaults: { kind: 'ean13' },
    example: '750103131130',
  },
}

export const SYMBOLOGY_KINDS: readonly SymbologyKind[] = Object.keys(SYMBOLOGY_META).filter(
  (key): key is SymbologyKind => key in SYMBOLOGY_META,
)

/** 誤り訂正レベルの説明。強いほど汚れに強い代わりにシンボルが大きくなる。 */
export const QR_ERROR_CORRECTION_META: {
  readonly [K in QrErrorCorrection]: { readonly label: string; readonly recovery: string }
} = {
  L: { label: 'L（低）', recovery: '約 7% の欠損まで復元' },
  M: { label: 'M（標準）', recovery: '約 15% の欠損まで復元' },
  Q: { label: 'Q（高）', recovery: '約 25% の欠損まで復元' },
  H: { label: 'H（最高）', recovery: '約 30% の欠損まで復元' },
}
