/**
 * Markdown の中の mermaid 図を 1 つ描く。
 *
 * mermaid はバンドルが大きい（node_modules で数 MB）。**静的 import せず、
 * ブロックが画面に入ってから `import('mermaid')` で読み込む。** これで
 * 図を含まない文書を開いても mermaid のチャンクは落ちてこない。
 *
 * 図は情報であって装飾ではないので `role="img"` と `aria-label` を付ける
 * （docs/accessibility.md §2 の 1.1.1）。図の意味は自動で言語化できないため、
 * ラベルはノード数に留め、ソースは `<details>` として常に読める形で残す
 * （その `<details>` は `renderMarkdown` が出す静的な HTML 側にある）。
 */
import DOMPurify from 'dompurify'
import { useEffect, useId, useRef, useState } from 'react'

type MermaidBlockProps = {
  /** 文書内での 0 始まりの通し番号。 */
  readonly index: number
  readonly source: string
}

type RenderState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'rendering' }
  | { readonly kind: 'rendered' }
  | { readonly kind: 'failed'; readonly message: string }

/**
 * mermaid を読み込む。サーバでは読まない。
 *
 * 描画は effect の中（＝クライアント）でしか起きないが、`import('mermaid')` が
 * そのままだと SSR ビルドにも mermaid と依存（cytoscape・KaTeX・各図の実装）が
 * 同梱され、Worker のバンドル（Free は 3 MiB）の 4 割を占めていた（docs/bundle.md）。
 * `import.meta.env.SSR` はビルド時の定数なので、サーバ側ではこの import ごと消える。
 */
const loadMermaid = import.meta.env.SSR ? null : () => import('mermaid')

const SVG_SANITIZE_OPTIONS = {
  USE_PROFILES: { html: true, svg: true, svgFilters: true },
  RETURN_DOM_FRAGMENT: true,
} as const

export const MermaidBlock = ({ index, source }: MermaidBlockProps) => {
  const figureRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [state, setState] = useState<RenderState>({ kind: 'idle' })
  const domId = `noter-mermaid-${useId().replaceAll(':', '')}-${index}`

  useEffect(() => {
    if (visible) return undefined
    const element = figureRef.current
    if (element === null || typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return undefined
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setVisible(true)
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [visible])

  useEffect(() => {
    const element = figureRef.current
    if (!visible || element === null) return undefined
    let cancelled = false
    setState({ kind: 'rendering' })
    const run = async (): Promise<void> => {
      try {
        if (loadMermaid === null) return
        const { default: mermaid } = await loadMermaid()
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: prefersDarkTheme() ? 'dark' : 'default',
          fontFamily: 'var(--noter-font-sans)',
        })
        const { svg } = await mermaid.render(domId, source)
        if (cancelled) return
        element.replaceChildren(toAccessibleDiagram(svg))
        setState({ kind: 'rendered' })
      } catch (error) {
        if (cancelled) return
        element.replaceChildren()
        setState({ kind: 'failed', message: describeFailure(error) })
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [visible, domId, source])

  return (
    <>
      {/* React はこの中身を触らない。SVG は上の effect が差し替える。 */}
      <div ref={figureRef} className="noter-mermaid-figure__svg" />
      {state.kind === 'failed' ? (
        <p className="noter-mermaid-figure__error">
          <strong>図 {index + 1} を描けませんでした。</strong> {state.message} 下の「mermaid
          のソース」を開いて書き方を確認してください。
        </p>
      ) : null}
    </>
  )
}

/**
 * mermaid が返した SVG を、支援技術から「1 枚の図」として読める形にする。
 *
 * `securityLevel: 'strict'` でも DOMPurify を通す（多層防御）。文字列のまま
 * innerHTML に入れず、断片を組み立ててから差し込む。
 */
const toAccessibleDiagram = (svg: string): DocumentFragment => {
  const fragment = DOMPurify.sanitize(svg, SVG_SANITIZE_OPTIONS)
  const diagram = fragment.querySelector('svg')
  if (diagram !== null) {
    const nodeCount = diagram.querySelectorAll('.node').length
    diagram.setAttribute('role', 'img')
    diagram.setAttribute('aria-label', `mermaid 図（${nodeCount} 個のノード）`)
    // 拡大しても横スクロールを出さない（AAA 1.4.10）。
    diagram.removeAttribute('width')
    diagram.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  }
  return fragment
}

const prefersDarkTheme = (): boolean => {
  const chosen = document.documentElement.dataset['theme']
  if (chosen === 'dark') return true
  if (chosen === 'light') return false
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

const describeFailure = (error: unknown): string => {
  if (!(error instanceof Error)) return '図の記法を読み取れませんでした。'
  return (error.message.split('\n')[0] ?? error.message).trim()
}
