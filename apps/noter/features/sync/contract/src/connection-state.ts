/**
 * クライアントから見た接続状態（`docs/domain-model.md` §状態遷移）。
 *
 * 「`reconnecting` のときだけ試行回数がある」「`rejected` のときだけ理由がある」を
 * union のメンバーとして持ち、不正な組み合わせを表現できなくする。
 */
import type { RejectReason } from './close-codes.ts'

export type ConnectionState =
  | { readonly kind: 'connecting' }
  | { readonly kind: 'connected' }
  | { readonly kind: 'reconnecting'; readonly attempt: number }
  | { readonly kind: 'offline' }
  | { readonly kind: 'rejected'; readonly reason: RejectReason }
