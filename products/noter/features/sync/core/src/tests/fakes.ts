/**
 * テスト用のフェイク。`RoomStorage` / `RoomSocket` / `RoomSockets` のインメモリ実装で、
 * モックライブラリの代わりに使う（noter-typescript §4「テストではプレーンなオブジェクトを渡す」）。
 *
 * SQL は本物のエンジンではなく、`schema.ts` が発行する文だけを見分ける簡易実装。
 * 文が増えたらここも足す。
 */
import type { AcceptedSocket, RoomSocket, RoomSockets, RoomStorage, SqlValue } from '../ports.ts'

export type FakeStorage = RoomStorage & {
  readonly alarmAt: () => number | null
  readonly setAlarmCalls: () => number
}

const asNumber = (value: SqlValue | undefined): number => (typeof value === 'number' ? value : 0)
const asString = (value: SqlValue | undefined): string => (typeof value === 'string' ? value : '')
const asBuffer = (value: SqlValue | undefined): ArrayBuffer =>
  value instanceof ArrayBuffer ? value : new ArrayBuffer(0)

export const makeFakeStorage = (): FakeStorage => {
  const meta = new Map<string, string>()
  let documentState: { readonly state: ArrayBuffer; readonly updatedAt: number } | null = null
  let alarm: number | null = null
  let setAlarmCalls = 0

  const exec = (query: string, ...bindings: readonly SqlValue[]) => {
    const statement = query.trim().replaceAll(/\s+/g, ' ')
    if (statement.startsWith('SELECT value FROM meta')) {
      const value = meta.get(asString(bindings[0]))
      return { toArray: () => (value === undefined ? [] : [{ value }]) }
    }
    if (statement.startsWith('INSERT OR REPLACE INTO meta')) {
      meta.set(asString(bindings[0]), asString(bindings[1]))
      return { toArray: () => [] }
    }
    if (statement.startsWith('SELECT state FROM document_state')) {
      return {
        toArray: () =>
          documentState === null
            ? []
            : [{ state: documentState.state, updated_at: documentState.updatedAt }],
      }
    }
    if (statement.startsWith('INSERT OR REPLACE INTO document_state')) {
      documentState = { state: asBuffer(bindings[0]), updatedAt: asNumber(bindings[1]) }
      return { toArray: () => [] }
    }
    return { toArray: (): readonly Record<string, SqlValue>[] => [] }
  }

  return {
    sql: { exec },
    getAlarm: () => Promise.resolve(alarm),
    setAlarm: (at: number) => {
      alarm = at
      setAlarmCalls += 1
      return Promise.resolve()
    },
    deleteAll: () => {
      meta.clear()
      documentState = null
      alarm = null
      return Promise.resolve()
    },
    alarmAt: () => alarm,
    setAlarmCalls: () => setAlarmCalls,
  }
}

export type FakeSocket = RoomSocket & {
  readonly sent: () => readonly Uint8Array[]
  readonly closedWith: () => { readonly code: number; readonly reason: string } | null
}

export const makeFakeSocket = (): FakeSocket => {
  const sent: Uint8Array[] = []
  let closed: { readonly code: number; readonly reason: string } | null = null
  let attachment: unknown = null

  return {
    send: (data: ArrayBuffer | string) => {
      if (typeof data !== 'string') sent.push(new Uint8Array(data))
    },
    close: (code?: number, reason?: string) => {
      closed = { code: code ?? 1000, reason: reason ?? '' }
    },
    serializeAttachment: (value: unknown) => {
      attachment = value
    },
    deserializeAttachment: () => attachment,
    sent: () => sent,
    closedWith: () => closed,
  }
}

export type FakeSockets = RoomSockets & {
  readonly open: () => readonly FakeSocket[]
  readonly autoResponse: () => readonly [string, string] | null
}

export const makeFakeSockets = (): FakeSockets => {
  const open: FakeSocket[] = []
  let autoResponse: readonly [string, string] | null = null

  return {
    accept: (_request: Request, attachment: unknown): AcceptedSocket => {
      const socket = makeFakeSocket()
      socket.serializeAttachment(attachment)
      open.push(socket)
      return { response: new Response(null, { status: 101 }), socket }
    },
    getWebSockets: () => open,
    setAutoResponse: (ping: string, pong: string) => {
      autoResponse = [ping, pong]
    },
    open: () => open,
    autoResponse: () => autoResponse,
  }
}
