/**
 * Markdown から mermaid のコードフェンスを抜き出す純粋関数。
 *
 * プレビューは `renderMarkdown` が置いたプレースホルダに SVG を差し込むが、
 * 「何番目のブロックがどのソースか」はこの関数が唯一の答えを持つ。
 * 図の描画に失敗したときに行番号で場所を示せるよう、開始行も返す。
 */

export type MermaidBlock = {
  /** 文書の先頭から数えた 0 始まりの通し番号。 */
  readonly index: number
  /** フェンスの中身（前後の改行を含まない）。 */
  readonly source: string
  /** 開きフェンス（```mermaid）の行番号。1 始まり。 */
  readonly line: number
}

/** 開きフェンス。CommonMark と同じく先頭の空白は 3 つまで許す。 */
const OPENING_FENCE = /^ {0,3}(`{3,})(.*)$/
/** 閉じフェンス。情報文字列を持てない。 */
const CLOSING_FENCE = /^ {0,3}(`{3,})[ \t]*$/

type OpenFence = {
  readonly markerLength: number
  readonly line: number
  readonly isMermaid: boolean
  readonly lines: string[]
}

export const extractMermaidBlocks = (markdown: string): readonly MermaidBlock[] => {
  const lines = markdown.split(/\r\n|\n|\r/)
  const blocks: MermaidBlock[] = []
  let open: OpenFence | undefined

  const close = (fence: OpenFence): void => {
    if (!fence.isMermaid) return
    blocks.push({ index: blocks.length, source: fence.lines.join('\n'), line: fence.line })
  }

  for (const [offset, raw] of lines.entries()) {
    if (open === undefined) {
      const opening = OPENING_FENCE.exec(raw)
      if (opening === null) continue
      const marker = opening[1] ?? ''
      const info = (opening[2] ?? '').trim().toLowerCase()
      open = {
        markerLength: marker.length,
        line: offset + 1,
        isMermaid: info === 'mermaid',
        lines: [],
      }
      continue
    }
    const closing = CLOSING_FENCE.exec(raw)
    if (closing !== null && (closing[1] ?? '').length >= open.markerLength) {
      close(open)
      open = undefined
      continue
    }
    open.lines.push(raw)
  }
  // 閉じ忘れたフェンスは文末までを中身とみなす（markdown-it と同じ扱い）。
  if (open !== undefined) close(open)
  return blocks
}
