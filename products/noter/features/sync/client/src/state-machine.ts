/**
 * 接続状態の遷移（`docs/domain-model.md` §状態遷移）。
 *
 * y-websocket のイベントをそのまま UI に流すと、再接続の試行回数や
 * 「もう繋がらない」の区別が各画面に散る。ここで 1 つの純粋関数にまとめ、
 * `provider.ts` は「イベントを翻訳して渡すだけ」にする。
 */
import type { ConnectionState, RejectReason } from '@noter/sync/contract'

export type ProviderEvent =
  | { readonly kind: 'connecting' }
  | { readonly kind: 'connected' }
  /** 相手都合で切れた。再接続してよい。 */
  | { readonly kind: 'disconnected' }
  /** 4xxx で閉じられた。再接続しても直らない。 */
  | { readonly kind: 'rejected'; readonly reason: RejectReason }
  | { readonly kind: 'offline' }
  | { readonly kind: 'online' }

export const INITIAL_STATE: ConnectionState = { kind: 'connecting' }

const reconnecting = (previous: ConnectionState): ConnectionState => ({
  kind: 'reconnecting',
  attempt: previous.kind === 'reconnecting' ? previous.attempt + 1 : 1,
})

export const nextState = (previous: ConnectionState, event: ProviderEvent): ConnectionState => {
  switch (event.kind) {
    case 'rejected':
      return { kind: 'rejected', reason: event.reason }

    case 'connected':
      return { kind: 'connected' }

    case 'connecting':
      // 拒否されたあとは操作なしに回復しない。再接続中なら試行回数を保つ
      if (previous.kind === 'rejected' || previous.kind === 'reconnecting') return previous
      return { kind: 'connecting' }

    case 'disconnected':
      if (previous.kind === 'rejected' || previous.kind === 'offline') return previous
      return reconnecting(previous)

    case 'offline':
      return previous.kind === 'rejected' ? previous : { kind: 'offline' }

    case 'online':
      return previous.kind === 'offline' ? { kind: 'reconnecting', attempt: 1 } : previous
  }
}
