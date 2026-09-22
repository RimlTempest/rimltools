/**
 * Markdown を HTML 文字列にする。
 *
 * **`html: false` で生の HTML は必ずエスケープする。** これが XSS に対する
 * 1 枚目の防壁で、2 枚目が UI 側の `DOMPurify.sanitize`。
 * `html: true` にしたくなったら ADR を書くこと（`plans/006` の Maintenance notes）。
 *
 * mermaid のフェンスは「プレースホルダ」に置き換えるだけで、SVG は差し込まない
 * （core は DOM を触らない）。図の描画は `ui/mermaid-block.tsx` の仕事。
 */
import type { MarkdownIt as MarkdownItInstance } from 'markdown-it'
import MarkdownIt from 'markdown-it'

export type MermaidPlaceholderInput = {
  /** 文書の先頭から数えた 0 始まりの通し番号。`extractMermaidBlocks` と一致する。 */
  readonly index: number
  readonly source: string
}

export type RenderMarkdownDeps = {
  readonly renderMermaidPlaceholder: (input: MermaidPlaceholderInput) => string
}

const MERMAID_INDEX_ATTR = 'data-noter-mermaid-index'

/** `<details>` に入れるソースを安全な文字列にする。 */
const escapeHtml = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

/**
 * 既定のプレースホルダ。
 *
 * JS が動かない環境でも図のソースが読めるように `<details>` を必ず置く
 * （docs/accessibility.md §2 の 1.1.1）。`data-mermaid-mount` は
 * `ui/markdown-preview.tsx` が SVG を差し込む先。
 */
export const defaultMermaidPlaceholder = (input: MermaidPlaceholderInput): string =>
  `<div class="noter-mermaid" data-index="${input.index}">`
  + `<div class="noter-mermaid-figure" data-mermaid-mount="${input.index}"></div>`
  + '<details class="noter-mermaid-source"><summary>mermaid のソース</summary>'
  + `<pre><code>${escapeHtml(input.source)}</code></pre></details></div>`

const DEFAULT_DEPS: RenderMarkdownDeps = { renderMermaidPlaceholder: defaultMermaidPlaceholder }

/**
 * 見出しテキストから id を作る。記号を落とし、空白をハイフンにするだけの純粋関数。
 * 何も残らないときは id を振らない（空の id は無効なため）。
 */
export const slugify = (text: string): string | undefined => {
  const slug = text
    .trim()
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}\s_-]/gu, '')
    .replaceAll(/\s+/gu, '-')
  return slug.length > 0 ? slug : undefined
}

export const renderMarkdown = (text: string, deps: RenderMarkdownDeps = DEFAULT_DEPS): string =>
  makeRenderer(deps).render(text)

const makeRenderer = (deps: RenderMarkdownDeps): MarkdownItInstance => {
  const md = MarkdownIt({ html: false, linkify: true, typographer: false })

  // 見出しに id を振る。同じ見出しが複数あっても id が重複しないよう連番を足す。
  md.core.ruler.push('noter_heading_ids', (state) => {
    const used = new Map<string, number>()
    for (const [index, token] of state.tokens.entries()) {
      if (token.type !== 'heading_open') continue
      const inline = state.tokens[index + 1]
      const slug = slugify(inline?.content ?? '')
      if (slug === undefined) continue
      const seen = (used.get(slug) ?? 0) + 1
      used.set(slug, seen)
      token.attrSet('id', seen === 1 ? slug : `${slug}-${seen}`)
    }
    return true
  })

  // mermaid のフェンスに通し番号を振る（レンダラは 1 つのトークンしか見られない）。
  md.core.ruler.push('noter_mermaid_index', (state) => {
    let count = 0
    for (const token of state.tokens) {
      if (token.type !== 'fence' || !isMermaidInfo(token.info)) continue
      token.attrSet(MERMAID_INDEX_ATTR, String(count))
      count += 1
    }
    return true
  })

  // 外部サイトを開いたときに opener を渡さない。
  const defaultLinkOpen = md.renderer.rules['link_open']
  md.renderer.rules['link_open'] = (tokens, index, options, env, self) => {
    tokens[index]?.attrSet('rel', 'noopener')
    return defaultLinkOpen === undefined
      ? self.renderToken(tokens, index, options)
      : defaultLinkOpen(tokens, index, options, env, self)
  }

  const defaultFence = md.renderer.rules['fence']
  md.renderer.rules['fence'] = (tokens, index, options, env, self) => {
    const token = tokens[index]
    const mermaidIndex = token?.attrGet(MERMAID_INDEX_ATTR) ?? null
    if (token === undefined || mermaidIndex === null) {
      return defaultFence === undefined
        ? self.renderToken(tokens, index, options)
        : defaultFence(tokens, index, options, env, self)
    }
    return deps.renderMermaidPlaceholder({
      index: Number(mermaidIndex),
      source: token.content.replace(/\n$/, ''),
    })
  }

  return md
}

const isMermaidInfo = (info: string): boolean => info.trim().toLowerCase() === 'mermaid'
