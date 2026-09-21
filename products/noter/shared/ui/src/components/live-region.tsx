type Urgency = 'polite' | 'assertive'

type LiveRegionProps = {
  /** 未設定でも領域は DOM に残す。後から挿入すると読み上げられないため。 */
  readonly message: string | undefined
  /** 既定は polite。入力エラーなど即時性が要るものだけ assertive。 */
  readonly urgency?: Urgency
}

/**
 * 動的な状態変化を読み上げる領域。
 *
 * - **最初から DOM に置く**。空のときも要素ごと消さない
 * - `aria-atomic` で毎回全文を読ませる（差分だけ読まれると意味が通らない）
 * - `assertive` は進行中の読み上げを中断するので、本当に緊急なときだけ
 */
export const LiveRegion = ({ message, urgency = 'polite' }: LiveRegionProps) => (
  <div
    className="noter-live-region"
    role={urgency === 'assertive' ? 'alert' : 'status'}
    aria-live={urgency}
    aria-atomic="true"
  >
    {message}
  </div>
)
