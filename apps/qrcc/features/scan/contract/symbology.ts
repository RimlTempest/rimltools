/**
 * 読み取れるシンボル体系。
 *
 * Rust 側の定義は `features/scan/engine/src/symbology.rs`。
 * ワイヤ形式（snake_case の文字列）が一致していることは、両側の
 * 「未知の symbology を握りつぶさない」テストが担保する。
 */
type ScanSymbologyMeta = {
  readonly label: string
  /** 1D か 2D か。結果の説明文で「バーコード」「コード」を出し分ける。 */
  readonly oneDimensional: boolean
  /**
   * ブラウザ組み込みの `BarcodeDetector` に頼めるときの形式名。
   * `undefined` なら wasm デコーダでしか読めない。
   */
  readonly detectorFormat: string | undefined
}

/**
 * 種類ごとのメタ情報。**Mapped Type なので、`ScanSymbology` にメンバーを足して
 * ここに 1 行足し忘れるとコンパイルエラーになる。**
 */
export const SCAN_SYMBOLOGY_META = {
  aztec: { label: 'Aztec', oneDimensional: false, detectorFormat: 'aztec' },
  codabar: { label: 'Codabar', oneDimensional: true, detectorFormat: 'codabar' },
  code39: { label: 'Code 39', oneDimensional: true, detectorFormat: 'code_39' },
  code93: { label: 'Code 93', oneDimensional: true, detectorFormat: 'code_93' },
  code128: { label: 'Code 128', oneDimensional: true, detectorFormat: 'code_128' },
  data_matrix: { label: 'Data Matrix', oneDimensional: false, detectorFormat: 'data_matrix' },
  dx_film_edge: { label: 'DX フィルムエッジ', oneDimensional: true, detectorFormat: undefined },
  ean8: { label: 'EAN-8', oneDimensional: true, detectorFormat: 'ean_8' },
  ean13: { label: 'EAN-13 / JAN', oneDimensional: true, detectorFormat: 'ean_13' },
  itf: { label: 'ITF（インターリーブド 2 of 5）', oneDimensional: true, detectorFormat: 'itf' },
  maxicode: { label: 'MaxiCode', oneDimensional: false, detectorFormat: undefined },
  micro_qr: { label: 'マイクロ QR コード', oneDimensional: false, detectorFormat: undefined },
  pdf417: { label: 'PDF417', oneDimensional: false, detectorFormat: 'pdf417' },
  qr: { label: 'QR コード', oneDimensional: false, detectorFormat: 'qr_code' },
  rectangular_micro_qr: {
    label: '長方形マイクロ QR',
    oneDimensional: false,
    detectorFormat: undefined,
  },
  rss14: { label: 'GS1 DataBar', oneDimensional: true, detectorFormat: undefined },
  rss_expanded: { label: 'GS1 DataBar 拡張型', oneDimensional: true, detectorFormat: undefined },
  telepen: { label: 'Telepen', oneDimensional: true, detectorFormat: undefined },
  upc_a: { label: 'UPC-A', oneDimensional: true, detectorFormat: 'upc_a' },
  upc_e: { label: 'UPC-E', oneDimensional: true, detectorFormat: 'upc_e' },
  upc_ean_extension: {
    label: 'UPC / EAN 追加記号',
    oneDimensional: true,
    detectorFormat: undefined,
  },
} as const satisfies Record<string, ScanSymbologyMeta>

export type ScanSymbology = keyof typeof SCAN_SYMBOLOGY_META

export const SCAN_SYMBOLOGY_KINDS: readonly ScanSymbology[] = Object.keys(
  SCAN_SYMBOLOGY_META,
).filter((key): key is ScanSymbology => key in SCAN_SYMBOLOGY_META)

export const isScanSymbology = (value: unknown): value is ScanSymbology =>
  typeof value === 'string' && value in SCAN_SYMBOLOGY_META

/**
 * `new BarcodeDetector({ formats })` に渡せる形式名の一覧。
 * ブラウザが知らない名前を混ぜると構築ごと失敗するので、頼めるものだけを並べる。
 */
export const DETECTABLE_FORMATS: readonly string[] = SCAN_SYMBOLOGY_KINDS.map(
  (kind) => SCAN_SYMBOLOGY_META[kind].detectorFormat,
).filter((format) => format !== undefined)

/**
 * `BarcodeDetector` が返した形式名を自分たちの語彙に直す。
 * 知らない名前（`unknown` など）は読み替えず `undefined` を返す。
 */
export const fromBarcodeDetectorFormat = (format: string): ScanSymbology | undefined =>
  SCAN_SYMBOLOGY_KINDS.find((kind) => SCAN_SYMBOLOGY_META[kind].detectorFormat === format)
