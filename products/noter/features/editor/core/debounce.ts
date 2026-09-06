/**
 * 「入力が落ち着いてから 1 回だけ実行する」。
 *
 * 打鍵のたびに本文を解析すると、長い文書で入力が引っかかる。時計は
 * 引数で受け取るので、待ち時間の挙動を実時間なしで確かめられる。
 */

/** 時計。ブラウザなら `setTimeout` / `clearTimeout`、テストでは偽物を渡す。 */
export type TimerPort<Handle> = {
  readonly setTimer: (run: () => void, delayMs: number) => Handle
  readonly clearTimer: (handle: Handle) => void
}

export type Debounced = {
  /** 予約する。待っている途中で呼ぶと待ち直す。 */
  readonly call: () => void
  /** 予約を取り消す。実行されない。 */
  readonly cancel: () => void
}

export const debounce = <Handle>(
  timer: TimerPort<Handle>,
  delayMs: number,
  run: () => void,
): Debounced => {
  let pending: Handle | undefined = undefined

  const cancel = (): void => {
    if (pending !== undefined) timer.clearTimer(pending)
    pending = undefined
  }

  return {
    call: () => {
      cancel()
      pending = timer.setTimer(() => {
        pending = undefined
        run()
      }, delayMs)
    },
    cancel,
  }
}
