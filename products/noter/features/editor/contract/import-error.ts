/**
 * 取り込み（ファイル・貼り付け）を断る理由と、その文言。
 *
 * `kind` に UI 文言を混ぜず、変換をここ 1 か所に集める
 * （`describeDocumentError`（`@noter/documents/contract`）と同じ形）。
 */
export type ImportError = {
  readonly kind: 'too_large'
  /** 上限（バイト）。 */
  readonly max: number
  /** 取り込もうとしたバイト数。 */
  readonly bytes: number
}

const megabytes = (bytes: number): string => `${(bytes / 1_048_576).toFixed(1)} MB`

export const describeImportError = (error: ImportError): string =>
  `取り込む内容が大きすぎます（上限 ${megabytes(error.max)}、選んだ内容は ${megabytes(error.bytes)}）。この文書には入りません。分割してから取り込んでください。`
