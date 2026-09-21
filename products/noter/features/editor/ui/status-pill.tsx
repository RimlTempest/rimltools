import type { StatusText } from '../contract/status.ts'

type StatusPillProps = {
  readonly status: StatusText
}

/**
 * 接続と同期の状態を 1 つに畳んだ表示（docs/design/ux.md §5）。
 *
 * **読み上げはここでは行わない。** 画面にただ 1 つある `LiveRegion` が
 * `status.announce` を受け取る（`docs/accessibility.md` §2 の 4.1.3:
 * ステータスメッセージの領域を複数持たない）。
 *
 * 色は補助。文言だけで状態が分かるようにしてある。
 */
export const StatusPill = ({ status }: StatusPillProps) => (
  <span className="noter-pill" data-tone={status.tone}>
    {status.label}
  </span>
)
