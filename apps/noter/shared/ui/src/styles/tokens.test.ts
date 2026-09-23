import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { Glob } from 'bun'

const root = new URL('../../../../', import.meta.url)
const read = (path: string | URL): string => readFileSync(path, 'utf8')

const tokensCss = read(new URL('./tokens.css', import.meta.url))
const indexCss = read(new URL('./index.css', import.meta.url))
const rdTokensCss = read(Bun.resolveSync('@rimltempest/riml-ds-tokens/tokens.css', import.meta.dir))
const rdThemeCss = read(
  Bun.resolveSync('@rimltempest/riml-ds-tokens/themes/noter.css', import.meta.dir),
)

const defined = (css: string, prefix: string): ReadonlySet<string> =>
  new Set([...css.matchAll(new RegExp(`(${prefix}[a-z0-9-]+)\\s*:`, 'g'))].map((m) => m[1] ?? ''))
const used = (css: string, prefix: string): ReadonlySet<string> =>
  new Set([...css.matchAll(new RegExp(`var\\((${prefix}[a-z0-9-]+)`, 'g'))].map((m) => m[1] ?? ''))

// 部品の中で style 属性や属性セレクタから与える変数。tokens.css には無くてよい
const COMPONENT_LOCAL = /^--noter-presence$/

/*
 * riml-ds に寄せない noter 固有のトークン（理由は tokens.css のコメントと docs/adr/0013）。
 * - presence-*: 参加者の色。riml-ds に対応が無い
 * - measure: 本文の幅。riml-ds の --rd-sizing-measure-max（80ch）は上限で、noter は読みやすさで 70ch
 * - header-h / toolbar-h: noter のレイアウトの寸法
 */
const KEPT_LOCAL: readonly string[] = [
  ...Array.from({ length: 8 }, (_, i) => `--noter-presence-${i}`),
  '--noter-on-presence',
  '--noter-measure',
  '--noter-header-h',
  '--noter-toolbar-h',
]

const appCssFiles = (): readonly string[] =>
  [
    ...new Glob('{shared/ui/src,features/*/ui,services/web/src}/**/*.css').scanSync(root.pathname),
  ].toSorted()

describe('デザイントークンは riml-ds（themes/noter）の別名', () => {
  test('riml-ds の tokens と noter テーマを読み込む', () => {
    expect(indexCss).toContain("@import '@rimltempest/riml-ds-tokens/tokens.css';")
    expect(indexCss).toContain("@import '@rimltempest/riml-ds-tokens/themes/noter.css';")
  })

  test('tokens.css が参照する --rd-* は riml-ds の tokens.css か themes/noter.css に定義がある', () => {
    const rd = new Set([...defined(rdTokensCss, '--rd-'), ...defined(rdThemeCss, '--rd-')])
    const missing = [...used(tokensCss, '--rd-')].filter((name) => !rd.has(name))
    expect(missing).toEqual([])
  })

  test('riml-ds を参照しない --noter-* は KEPT_LOCAL だけ', () => {
    // 値に var(--rd-*) を 1 つも含まない定義を拾う（calc や light-dark の中で使うものは別名とみなす）
    const raw = [...tokensCss.matchAll(/(--noter-[a-z0-9-]+)\s*:([^;]*);/g)]
      .filter((m) => !(m[2] ?? '').includes('var(--rd-'))
      .map((m) => m[1] ?? '')
    expect([...new Set(raw)].toSorted()).toEqual([...KEPT_LOCAL].toSorted())
  })

  test('アプリの CSS が使う --noter-* はすべて tokens.css に定義がある', () => {
    const names = defined(tokensCss, '--noter-')
    const missing = appCssFiles()
      .flatMap((file) => Array.from(used(read(new URL(file, root)), '--noter-')))
      .filter((name) => !names.has(name) && !COMPONENT_LOCAL.test(name))
    expect([...new Set(missing)]).toEqual([])
  })

  test('テーマの明示選択（data-theme）は残っている', () => {
    expect(tokensCss).toContain(":root[data-theme='light']")
    expect(tokensCss).toContain(":root[data-theme='dark']")
  })
})
