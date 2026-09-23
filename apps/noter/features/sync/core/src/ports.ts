/**
 * core が要求する依存の型。**利用側が定義する**（ISP / rimltools-typescript §4）。
 *
 * Durable Object / Workers の実型は import しない。必要なメンバーだけを
 * 構造的に宣言することで、core は `cloudflare:workers` にも DOM にも依存しない。
 */

/** DO SQLite が受け渡しできる値（`SqlStorageValue` の構造的な写し）。 */
export type SqlValue = string | number | ArrayBuffer | null

export type SqlCursor = {
  readonly toArray: () => readonly Record<string, SqlValue>[]
}

/** `DurableObjectStorage` のうち core が使う部分だけ。 */
export type RoomStorage = {
  readonly sql: {
    readonly exec: (query: string, ...bindings: readonly SqlValue[]) => SqlCursor
  }
  readonly getAlarm: () => Promise<number | null>
  readonly setAlarm: (at: number) => Promise<void>
  readonly deleteAll: () => Promise<void>
}

/**
 * Workers の `WebSocket` のうち core が使う部分だけ。
 * core はグローバルの `WebSocket` 型を参照しない（ブラウザ向けの型と混ざらないように）。
 */
export type RoomSocket = {
  readonly send: (data: ArrayBuffer | string) => void
  readonly close: (code?: number, reason?: string) => void
  readonly serializeAttachment: (value: unknown) => void
  readonly deserializeAttachment: () => unknown
}

/** Upgrade を受け付けた結果。101 のレスポンスと、サーバ側のソケット。 */
export type AcceptedSocket = {
  readonly response: Response
  readonly socket: RoomSocket
}

/**
 * `DurableObjectState` のうち core が使う部分だけ。
 * `WebSocketPair` の生成は Workers 固有なので `accept` の内側（worker 層）に閉じ込める。
 */
export type RoomSockets = {
  readonly accept: (request: Request, attachment: unknown) => AcceptedSocket
  readonly getWebSockets: () => readonly RoomSocket[]
  readonly setAutoResponse: (ping: string, pong: string) => void
}

export type RoomDeps = {
  readonly storage: RoomStorage
  readonly sockets: RoomSockets
  readonly now: () => number
  /** D1 の `document.updated_at` を触る。失敗しても編集を止めない（ADR-0005）。 */
  readonly touch: (updatedAt: number) => Promise<void>
}
