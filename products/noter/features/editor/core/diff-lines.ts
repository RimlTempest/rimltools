/**
 * 行単位の差分（LCS）。
 *
 * 提案（WebMCP の `propose-edit`）を人が読んで判断するための材料なので、
 * **依存を足さずに**書いてある。I/O も乱数も時計も無い純粋関数。
 *
 * 計算量は O(n×m)。素朴に組むと長い文書で表が爆発するため、
 *
 * 1. 先頭と末尾の一致する行を先に落とす（提案は大抵ごく一部の書き換えなので、
 *    これだけで実際の計算対象は数行まで縮む）
 * 2. それでも残りが `MAX_DIFF_LINES` 行を超えるときは、LCS を諦めて
 *    **まるごと置き換え**（全部削除 + 全部追加）として表す
 *
 * 2 に落ちても差分の意味は正しい（前後の本文はどちらも復元できる）。
 * 読みやすさが落ちるだけで、嘘は表示しない。
 */

export type DiffLineKind = 'equal' | 'inserted' | 'deleted'

export type DiffLine = {
  readonly kind: DiffLineKind
  readonly text: string
}

/** LCS の表を作ってよい行数の上限（前後の一致を落としたあとの残り）。 */
export const MAX_DIFF_LINES = 5000

/**
 * 空文字列は「0 行」。`''.split('\n')` は `['']` を返すので、そのまま使うと
 * 空文書に見えない 1 行が生まれる。
 */
const toLines = (text: string): readonly string[] => (text === '' ? [] : text.split('\n'))

const marked = (kind: DiffLineKind, lines: readonly string[]): readonly DiffLine[] =>
  lines.map((text) => ({ kind, text }))

/** 方向表の値。backtrack でどちらから来たかを 1 バイトで覚える。 */
const FROM_DIAGONAL = 0
const FROM_ABOVE = 1
const FROM_LEFT = 2

const lcsDiff = (before: readonly string[], after: readonly string[]): readonly DiffLine[] => {
  const rows = before.length
  const columns = after.length
  const width = columns + 1

  // 長さは 2 行あれば足りる。方向だけ全部覚える（1 セット 1 バイト）
  const from = new Uint8Array((rows + 1) * width)
  let previous = new Int32Array(width)
  let current = new Int32Array(width)

  for (let row = 1; row <= rows; row++) {
    current[0] = 0
    for (let column = 1; column <= columns; column++) {
      const diagonal = previous[column - 1] ?? 0
      const above = previous[column] ?? 0
      const left = current[column - 1] ?? 0
      if (before[row - 1] === after[column - 1]) {
        current[column] = diagonal + 1
        from[row * width + column] = FROM_DIAGONAL
      } else if (above > left) {
        // 引き分けのときは「左（追加）」を選ぶ。こうしておくと backtrack の
        // 向きが揃い、置き換えが必ず「削除 → 追加」の順で並ぶ
        current[column] = above
        from[row * width + column] = FROM_ABOVE
      } else {
        current[column] = left
        from[row * width + column] = FROM_LEFT
      }
    }
    const swap = previous
    previous = current
    current = swap
  }

  const reversed: DiffLine[] = []
  let row = rows
  let column = columns
  while (row > 0 && column > 0) {
    const direction = from[row * width + column]
    if (direction === FROM_DIAGONAL) {
      reversed.push({ kind: 'equal', text: before[row - 1] ?? '' })
      row -= 1
      column -= 1
    } else if (direction === FROM_ABOVE) {
      reversed.push({ kind: 'deleted', text: before[row - 1] ?? '' })
      row -= 1
    } else {
      reversed.push({ kind: 'inserted', text: after[column - 1] ?? '' })
      column -= 1
    }
  }
  while (row > 0) {
    reversed.push({ kind: 'deleted', text: before[row - 1] ?? '' })
    row -= 1
  }
  while (column > 0) {
    reversed.push({ kind: 'inserted', text: after[column - 1] ?? '' })
    column -= 1
  }
  return reversed.toReversed()
}

export const diffLines = (before: string, after: string): readonly DiffLine[] => {
  const beforeLines = toLines(before)
  const afterLines = toLines(after)

  let head = 0
  while (
    head < beforeLines.length
    && head < afterLines.length
    && beforeLines[head] === afterLines[head]
  ) {
    head += 1
  }

  let tail = 0
  while (
    tail < beforeLines.length - head
    && tail < afterLines.length - head
    && beforeLines[beforeLines.length - 1 - tail] === afterLines[afterLines.length - 1 - tail]
  ) {
    tail += 1
  }

  const middleBefore = beforeLines.slice(head, beforeLines.length - tail)
  const middleAfter = afterLines.slice(head, afterLines.length - tail)

  const middle =
    middleBefore.length > MAX_DIFF_LINES || middleAfter.length > MAX_DIFF_LINES
      ? [...marked('deleted', middleBefore), ...marked('inserted', middleAfter)]
      : lcsDiff(middleBefore, middleAfter)

  return [
    ...marked('equal', beforeLines.slice(0, head)),
    ...middle,
    ...marked('equal', beforeLines.slice(beforeLines.length - tail)),
  ]
}
