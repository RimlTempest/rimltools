/**
 * 読み取り履歴。I/O を持たない純粋な関数だけを置く。
 *
 * カメラは同じコードを毎秒何度も見る。素直に全部積むと履歴が膨れ、
 * 読み上げ領域も鳴り続けて使い物にならないので、**直前と同じ検出は捨てる**。
 */
import type { Detection } from '../contract/index.ts'

/** 覚えておく件数。カメラを向けっぱなしでも増え続けないための上限。 */
export const HISTORY_LIMIT = 20

export type Recorded = {
  readonly history: readonly Detection[]
  /** 直前と同じ検出なら false。読み上げるかどうかの判断に使う。 */
  readonly announce: boolean
}

const isSame = (left: Detection, right: Detection): boolean =>
  left.text === right.text && left.symbology === right.symbology

/**
 * 検出を履歴に足す。新しいものが先頭。
 * 直前とまったく同じ検出なら、履歴も読み上げも変えない。
 */
export const recordDetection = (history: readonly Detection[], detection: Detection): Recorded => {
  const latest = history[0]
  if (latest !== undefined && isSame(latest, detection)) {
    return { history, announce: false }
  }
  return { history: [detection, ...history].slice(0, HISTORY_LIMIT), announce: true }
}
