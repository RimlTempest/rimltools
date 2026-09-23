import { useEffect, useRef, useState } from 'react'
import type { ConnectionState } from '@noter/sync/contract'
import { PERSIST_DELAY_MS } from '@noter/sync/contract'
import type { Awareness } from 'y-protocols/awareness'
import * as Y from 'yjs'
import type { Peer } from '../contract/peer.ts'
import type { SaveState } from '../contract/save-state.ts'
import { localPresenceState, readPeers } from '../core/awareness.ts'

/**
 * 接続の実体。`@noter/sync/client` の `makeDocumentProvider` が返す形の
 * うち、この画面が使うぶんだけを**利用側で**定義している（ISP）。
 */
export type SyncProvider = {
  readonly awareness: Awareness
  readonly destroy: () => void
}

export type DocumentSyncDeps = {
  /** 接続を開く。配線は `*.route.tsx` の仕事で、ここは呼ぶだけ。 */
  readonly connect: (input: {
    readonly doc: Y.Doc
    readonly onState: (state: ConnectionState) => void
  }) => SyncProvider
  readonly now: () => number
  /**
   * 自分の名前と色。**presence を送ってよい人だけ**渡す
   * （閲覧のみの人は送らない。覗き見感を出さないため — `can(role, 'presence')`）。
   */
  readonly presence: { readonly name: string; readonly colorIndex: number } | undefined
}

export type DocumentSync = {
  readonly ytext: Y.Text
  readonly undoManager: Y.UndoManager
  /** 接続が open するまでは `undefined`。エディタはそれまで待つ。 */
  readonly awareness: Awareness | undefined
  readonly connection: ConnectionState
  readonly save: SaveState
  readonly peers: readonly Peer[]
}

/**
 * 文書 1 本ぶんの同期（`docs/realtime-protocol.md` §7）。
 *
 * `Y.Doc` は描画の外（`useState` の初期化）で 1 度だけ作る。接続は
 * `useEffect` で開き、離れるときに必ず閉じる。
 *
 * `save` は**クライアント側の推定**。v1 のサーバは「書けた」を通知しない
 * （ADR-0005）ので、更新が止まって `PERSIST_DELAY_MS` 経ったら届いたとみなす。
 */
export const useDocumentSync = (deps: DocumentSyncDeps): DocumentSync => {
  const [core] = useState(() => {
    const doc = new Y.Doc()
    const ytext = doc.getText('content')
    return { doc, ytext, undoManager: new Y.UndoManager(ytext) }
  })

  const [awareness, setAwareness] = useState<Awareness | undefined>(undefined)
  const [connection, setConnection] = useState<ConnectionState>({ kind: 'connecting' })
  const [peers, setPeers] = useState<readonly Peer[]>([])
  const [save, setSave] = useState<SaveState>(() => ({ kind: 'saved', at: deps.now() }))

  const connectRef = useRef(deps.connect)
  const nowRef = useRef(deps.now)

  useEffect(() => {
    connectRef.current = deps.connect
    nowRef.current = deps.now
  }, [deps.connect, deps.now])

  useEffect(() => {
    const provider = connectRef.current({ doc: core.doc, onState: setConnection })
    setAwareness(provider.awareness)

    const refresh = (): void => {
      setPeers(readPeers(provider.awareness.getStates(), provider.awareness.clientID))
    }
    provider.awareness.on('change', refresh)
    refresh()

    return () => {
      provider.awareness.off('change', refresh)
      provider.destroy()
      setAwareness(undefined)
      setPeers([])
    }
  }, [core])

  useEffect(() => {
    if (awareness === undefined || deps.presence === undefined) return
    awareness.setLocalStateField(
      'user',
      localPresenceState(deps.presence.name, deps.presence.colorIndex),
    )
  }, [awareness, deps.presence])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined = undefined
    const onUpdate = (): void => {
      setSave({ kind: 'dirty' })
      if (timer !== undefined) clearTimeout(timer)
      timer = setTimeout(() => setSave({ kind: 'saved', at: nowRef.current() }), PERSIST_DELAY_MS)
    }
    core.doc.on('update', onUpdate)
    return () => {
      if (timer !== undefined) clearTimeout(timer)
      core.doc.off('update', onUpdate)
    }
  }, [core])

  return {
    ytext: core.ytext,
    undoManager: core.undoManager,
    awareness,
    connection,
    save,
    peers,
  }
}
