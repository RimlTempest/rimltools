/**
 * 同期レイヤの調整値。根拠は ADR-0005 と `docs/free-tier-budget.md`。
 * 上限（`MAX_WS_MESSAGE_BYTES` など）は `@noter/contract` に置く。
 */

/** 更新を受けてから永続化するまでの遅延。損失窓の上限でもある（ADR-0005）。 */
export const PERSIST_DELAY_MS = 5000

/** D1 の `document.updated_at` を触る間隔の下限。 */
export const TOUCH_THROTTLE_MS = 60_000

/** 1 ソケットぶんの awareness バイト列の上限。attachment は 16 KB まで（ADR-0003）。 */
export const MAX_AWARENESS_BYTES = 16_384

/** 書き込みが失敗し続けたときの alarm 再設定の上限（ADR-0005）。 */
export const PERSIST_BACKOFF_MAX_MS = 60_000
