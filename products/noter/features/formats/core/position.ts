/**
 * 文字オフセットを、エディタが画面に出す行・列に直す。
 *
 * jsonc-parser のようにオフセットしか返さないライブラリの位置を
 * `Diagnostic` に載せるために使う。行・列はどちらも **1 始まり**。
 * 列は UTF-16 コードユニット単位（CodeMirror の数え方と揃える）。
 */
export type Position = {
  readonly line: number
  readonly column: number
}

export const positionAt = (text: string, offset: number): Position => {
  const clamped = Math.min(Math.max(offset, 0), text.length)
  let line = 1
  let lineStart = 0
  let index = 0
  while (index < clamped) {
    const character = text[index]
    if (character === '\n') {
      line += 1
      index += 1
      lineStart = index
      continue
    }
    if (character === '\r') {
      // CRLF は 2 文字で 1 つの改行。CR 単体も改行として数える。
      index += text[index + 1] === '\n' ? 2 : 1
      line += 1
      lineStart = index
      continue
    }
    index += 1
  }
  return { line, column: clamped - lineStart + 1 }
}
