/**
 * ブラウザ側の同期アダプタ（`docs/realtime-protocol.md` §7）。
 *
 * 再接続・backoff・awareness のハートビート・`Y.Doc` との束縛は
 * `y-websocket` に任せる（ADR-0013）。ここが足すのは 3 つだけ:
 *
 * 1. 接続先の組み立て（`/ws/:documentId`）
 * 2. `4xxx` の close を「再接続しない」状態へ翻訳する
 * 3. `navigator` のオンライン/オフラインを状態に混ぜる
 */
import type { DocumentId } from '@noter/contract'
import type { ConnectionState } from '@noter/sync/contract'
import { reasonOf } from '@noter/sync/contract'
import type { Awareness } from 'y-protocols/awareness'
import { WebsocketProvider } from 'y-websocket'
import type * as Y from 'yjs'
import type { ProviderEvent } from './state-machine.ts'
import { INITIAL_STATE, nextState } from './state-machine.ts'
import { toWebSocketOrigin } from './url.ts'

export type ProviderDeps = {
  /** ページの origin。`location.origin` を composition root から渡す。 */
  readonly origin: string
  readonly documentId: DocumentId
  readonly doc: Y.Doc
  readonly onState: (state: ConnectionState) => void
}

export type DocumentProvider = {
  readonly awareness: Awareness
  readonly destroy: () => void
}

const statusEvent = (status: 'connected' | 'connecting' | 'disconnected'): ProviderEvent =>
  status === 'disconnected' ? { kind: 'disconnected' } : { kind: status }

export const makeDocumentProvider = (deps: ProviderDeps): DocumentProvider => {
  const provider = new WebsocketProvider(
    toWebSocketOrigin(deps.origin),
    deps.documentId,
    deps.doc,
    // BroadcastChannel は同一端末の別タブ同期。DO 経由で十分速く、二重経路はバグ源になる
    { disableBc: true },
  )

  let state: ConnectionState = INITIAL_STATE
  const apply = (event: ProviderEvent): void => {
    const next = nextState(state, event)
    if (next === state) return
    state = next
    deps.onState(next)
  }

  const onStatus = ({ status }: { status: 'connected' | 'connecting' | 'disconnected' }): void => {
    apply(statusEvent(status))
  }

  const onClosed = ({ code }: { code: number; reason: string }): void => {
    const reason = reasonOf(code)
    // y-websocket 側で shouldConnect は false になっている。念のため接続も畳む
    provider.disconnect()
    apply(reason === null ? { kind: 'disconnected' } : { kind: 'rejected', reason })
  }

  const onOffline = (): void => apply({ kind: 'offline' })
  const onOnline = (): void => apply({ kind: 'online' })

  provider.on('status', onStatus)
  provider.on('closed', onClosed)
  globalThis.addEventListener('offline', onOffline)
  globalThis.addEventListener('online', onOnline)

  deps.onState(state)
  if (!globalThis.navigator.onLine) apply({ kind: 'offline' })

  return {
    awareness: provider.awareness,
    destroy: () => {
      globalThis.removeEventListener('offline', onOffline)
      globalThis.removeEventListener('online', onOnline)
      provider.off('status', onStatus)
      provider.off('closed', onClosed)
      provider.destroy()
    },
  }
}
