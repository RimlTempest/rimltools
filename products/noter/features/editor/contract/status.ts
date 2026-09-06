/**
 * ステータスピルの見た目と読み上げ（docs/design/ux.md §5）。
 *
 * `ConnectionState` と `SaveState` を 1 つの文言に畳んだ結果だけを持つ。
 * 「どう畳むか」は `features/editor/core/status-text.ts`。
 */

export const STATUS_TONES = ['muted', 'success', 'warning', 'danger'] as const

export type StatusTone = (typeof STATUS_TONES)[number]

export type StatusText = {
  /** ピルに出す文言。色だけで状態を伝えないので、これは常に必要。 */
  readonly label: string
  /** 読み上げる文言。読ませないときは `null`（連続する同じ文言も呼び出し側が抑制する）。 */
  readonly announce: string | null
  readonly tone: StatusTone
}
