/**
 * 「3 行目 5 列」を文書内の範囲に直す。
 *
 * 指摘（`Diagnostic`）は**本文を読み取った時点**のもので、そのあとに打鍵が
 * 続けば行数も列数も変わる。どんな値が来ても文書の中に収まるよう丸めるので、
 * 呼び出し側は範囲外を心配しなくてよい。
 */

/** CodeMirror の `Text` のうち、ここで使うぶんだけ（ISP）。行番号は 1 始まり。 */
export type TextLines = {
  readonly lines: number
  readonly line: (number: number) => { readonly from: number; readonly to: number }
}

export type TextRange = { readonly from: number; readonly to: number }

/** 1 始まりの行・列を、その行の終わりまでの範囲にする。 */
export const rangeAt = (doc: TextLines, line: number, column: number): TextRange => {
  const target = doc.line(clamp(line, 1, doc.lines))
  const from = Math.min(target.from + clamp(column, 1, Number.MAX_SAFE_INTEGER) - 1, target.to)
  return { from, to: target.to }
}

/** 数でない値（NaN・Infinity）は最小値として扱う。 */
const clamp = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.min(Math.max(Math.trunc(value), min), max) : min
