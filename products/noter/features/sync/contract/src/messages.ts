/**
 * ワイヤ上のメッセージ種別（y-websocket 互換、ADR-0013）。
 *
 * `2` auth は使わない。権限は close code で伝える。
 * `100` 以上は noter 独自の予約帯で、追加するときは ADR を書く。
 */
export const MESSAGE_SYNC = 0
export const MESSAGE_AWARENESS = 1
export const MESSAGE_QUERY_AWARENESS = 3

/** `MESSAGE_SYNC` の副種別（y-protocols/sync）。 */
export const SYNC_STEP1 = 0
export const SYNC_STEP2 = 1
export const SYNC_UPDATE = 2

/** これ以上は noter 独自拡張のための予約。 */
export const MESSAGE_RESERVED_FLOOR = 100
