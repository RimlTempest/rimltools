/**
 * シンボル体系と、その体系固有の設定。
 *
 * Rust 側の定義は `features/generate/engine/src/symbology.rs`。
 * ワイヤ形式（serde の tag = "kind"）が一致していることは
 * `features/generate/contract/conformance.test.ts` が担保する。
 */
import type { PayloadKind } from './payload.ts'

export type QrErrorCorrection = 'L' | 'M' | 'Q' | 'H'
export type Code128Charset = 'auto' | 'a' | 'b' | 'c'

export type Symbology =
  | { readonly kind: 'qr'; readonly ec: QrErrorCorrection }
  | { readonly kind: 'code128'; readonly charset: Code128Charset }
  | { readonly kind: 'ean13' }
  | { readonly kind: 'code39' }
  | { readonly kind: 'code93' }
  | { readonly kind: 'ean8' }
  | { readonly kind: 'codabar' }

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
  /**
   * この符号に載せられる内容の種類。
   *
   * `'all'` は「これから増える種類も含めて全部」。QR は文字数さえ足りれば
   * 何でも載るので `'all'` にしておく。こうすると**内容を増やす作業が
   * この表を触らずに済む**（1D の符号は明示した種類だけを受け入れる）。
   */
  readonly acceptsPayloads: 'all' | readonly PayloadKind[]
}

/**
 * 種類ごとのメタ情報。**Mapped Type なので、`Symbology` にメンバーを足して
 * ここに 1 行足し忘れるとコンパイルエラーになる。**
 * これが「拡張性」の実体で、規約ではなく型が追加漏れを止める。
 *
 * 内容の種類（`PAYLOAD_KINDS`）を増やすときは、**このファイルを触らなくてよい**。
 * QR は `'all'` なので自動的に受け入れる。1D の符号に新しい種類を載せたいときだけ、
 * その符号の `acceptsPayloads` に足す。
 */
export const SYMBOLOGY_META: { readonly [K in SymbologyKind]: SymbologyMeta<K> } = {
  qr: {
    label: 'QR コード',
    description: '日本語も URL も入る 2 次元コード。誤り訂正レベルを選べます。',
    oneDimensional: false,
    quietZone: 4,
    defaults: { kind: 'qr', ec: 'M' },
    example: 'https://example.com',
    acceptsPayloads: 'all',
  },
  code128: {
    label: 'Code 128',
    description: '英数字を高密度で表せる 1 次元バーコード。物流や在庫でよく使われます。',
    oneDimensional: true,
    quietZone: 10,
    defaults: { kind: 'code128', charset: 'auto' },
    example: 'ABC-12345',
    // Code128 は ASCII のみ。URL とテキストは載るが、日本語混じりの Wi-Fi 設定は載らない
    acceptsPayloads: ['text', 'url'],
  },
  ean13: {
    label: 'EAN-13 / JAN',
    description: '商品識別に使う 13 桁のバーコード。12 桁を入れると検査数字を計算します。',
    oneDimensional: true,
    quietZone: 9,
    defaults: { kind: 'ean13' },
    example: '750103131130',
    // EAN-13 は数字だけなので、テキスト以外は入れられない
    acceptsPayloads: ['text'],
  },
  code39: {
    label: 'Code 39',
    description: '英数字と一部の記号を表せる 1 次元バーコード。物流や工業製品でよく使われます。',
    oneDimensional: true,
    // Code39 は業界慣行として左右 10X の静寂域を取る
    quietZone: 10,
    defaults: { kind: 'code39' },
    example: 'CODE-39',
    // barcoders の Code39 実装は数字・英大文字・一部記号のみ受け付ける
    acceptsPayloads: ['text'],
  },
  code93: {
    label: 'Code 93',
    description: 'Code 39 より高密度に表せる 1 次元バーコード。物流でよく使われます。',
    oneDimensional: true,
    // Code93 は業界慣行として左右 10X の静寂域を取る
    quietZone: 10,
    defaults: { kind: 'code93' },
    example: 'CODE-93',
    // barcoders の Code93 実装（基本モードのみ）は数字・英大文字・一部記号を受け付ける
    acceptsPayloads: ['text'],
  },
  ean8: {
    label: 'EAN-8',
    description: '小さな商品向けの 8 桁のバーコード。7 桁を入れると検査数字を計算します。',
    oneDimensional: true,
    // GS1 の規格どおり左右 7X
    quietZone: 7,
    defaults: { kind: 'ean8' },
    example: '5512345',
    // EAN-8 は数字だけなので、テキスト以外は入れられない
    acceptsPayloads: ['text'],
  },
  codabar: {
    label: 'Codabar',
    description: '数字と一部の記号を表せる 1 次元バーコード。図書館や血液バッグでよく使われます。',
    oneDimensional: true,
    // Codabar は業界慣行として左右 10X の静寂域を取る
    quietZone: 10,
    defaults: { kind: 'codabar' },
    example: 'A1234B',
    // barcoders の Codabar 実装は数字と一部記号（開始・終了は A/B/C/D）のみ受け付ける
    acceptsPayloads: ['text'],
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
