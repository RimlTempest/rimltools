/**
 * WebSocket の close code。`docs/realtime-protocol.md` §1「拒否時の HTTP / close code」が
 * 唯一の定義で、ここはその写し。
 *
 * 4000〜4999 はアプリケーション定義の帯で、クライアントは**再接続しない**
 * （`ConnectionState.rejected`）。それ以外（1006 など）は backoff 付きで再接続する。
 */
export const CLOSE_CODES = {
  badRequest: 4400,
  forbidden: 4403,
  notFound: 4404,
  tooLarge: 4413,
  limit: 4429,
} as const

export type CloseCode = (typeof CLOSE_CODES)[keyof typeof CLOSE_CODES]

/** 画面に出す理由。`docs/design/ux.md` §5 の文言はこのタグから引く。 */
export type RejectReason = 'bad_request' | 'forbidden' | 'not_found' | 'too_large' | 'limit'

const REASON_BY_CODE: { readonly [K in CloseCode]: RejectReason } = {
  [CLOSE_CODES.badRequest]: 'bad_request',
  [CLOSE_CODES.forbidden]: 'forbidden',
  [CLOSE_CODES.notFound]: 'not_found',
  [CLOSE_CODES.tooLarge]: 'too_large',
  [CLOSE_CODES.limit]: 'limit',
}

const isCloseCode = (code: number): code is CloseCode =>
  Object.values(CLOSE_CODES).some((known) => known === code)

/** 未知の code は null。呼び出し側は「再接続してよい切断」として扱う。 */
export const reasonOf = (code: number): RejectReason | null =>
  isCloseCode(code) ? REASON_BY_CODE[code] : null
