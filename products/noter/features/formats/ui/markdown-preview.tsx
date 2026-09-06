/**
 * Markdown のプレビュー。
 *
 * XSS に対する防壁は 2 枚ある:
 *   1. `renderMarkdown` が `html: false` で生の HTML をエスケープする
 *   2. ここで `DOMPurify.sanitize` を通す
 * **`dangerouslySetInnerHTML` を書いてよいのはこのファイルだけ。**
 *
 * mermaid の図はここでは描かない。`renderMarkdown` が置いた
 * `[data-mermaid-mount]` に、`MermaidBlock` をポータルで差し込む。
 * こうすると mermaid のバンドルは図が画面に入るまで読み込まれない。
 */
import DOMPurify from 'dompurify'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { extractMermaidBlocks } from '../core/mermaid-blocks.ts'
import { renderMarkdown } from '../core/render-markdown.ts'
import { MermaidBlock } from './mermaid-block.tsx'

type MarkdownPreviewProps = {
  readonly markdown: string
  /** ランドマークの名前。1 画面に複数のプレビューを置くときだけ変える。 */
  readonly label?: string
}

const SANITIZE_OPTIONS = { USE_PROFILES: { html: true } } as const

export const MarkdownPreview = ({ markdown, label = 'プレビュー' }: MarkdownPreviewProps) => {
  const html = useMemo(() => {
    const rendered = renderMarkdown(markdown)
    // DOM の無い環境（SSR）では sanitize が素通しになる。素通しさせるより
    // 何も出さない方が安全なので、その場合は空にする。
    return DOMPurify.isSupported ? DOMPurify.sanitize(rendered, SANITIZE_OPTIONS) : ''
  }, [markdown])
  /**
   * **`__html` のオブジェクトは毎回作り直さない。** React 19 は
   * `dangerouslySetInnerHTML` の値が別のオブジェクトになると innerHTML を
   * 当て直すので、下のポータルで差し込んだ図が次の描画で消えてしまう。
   */
  const inner = useMemo(() => ({ __html: html }), [html])
  const blocks = useMemo(() => extractMermaidBlocks(markdown), [markdown])
  const rootRef = useRef<HTMLElement>(null)
  const [mounts, setMounts] = useState<readonly Element[]>([])

  useEffect(() => {
    // html を差し替えた直後に走る。innerHTML ごと作り直されるので、
    // 差し込み先も毎回取り直す。
    const root = rootRef.current
    setMounts(
      root === null || html === '' ? [] : [...root.querySelectorAll('[data-mermaid-mount]')],
    )
  }, [html])

  return (
    <>
      <section
        ref={rootRef}
        className="noter-markdown"
        aria-label={label}
        // oxlint-disable-next-line react/no-danger -- sanitized by DOMPurify
        dangerouslySetInnerHTML={inner}
      />
      {mounts.map((mount, position) => {
        const block = blocks[position]
        return block === undefined
          ? null
          : createPortal(
              <MermaidBlock index={block.index} source={block.source} />,
              mount,
              `mermaid-${block.index}`,
            )
      })}
    </>
  )
}
