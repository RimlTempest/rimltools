import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { Glob } from 'bun'

const root = new URL('../../../../', import.meta.url)
const read = (path: string | URL): string => readFileSync(path, 'utf8')

const tokensCss = read(new URL('./tokens.css', import.meta.url))
const rdTokensCss = read(Bun.resolveSync('@rimltempest/riml-ds-tokens/tokens.css', import.meta.dir))
const rdThemeCss = read(
  Bun.resolveSync('@rimltempest/riml-ds-tokens/themes/qrcc.css', import.meta.dir),
)

const defined = (css: string, prefix: string): ReadonlySet<string> =>
  new Set([...css.matchAll(new RegExp(`(${prefix}[a-z0-9-]+)\\s*:`, 'g'))].map((m) => m[1] ?? ''))
const used = (css: string, prefix: string): ReadonlySet<string> =>
  new Set([...css.matchAll(new RegExp(`var\\((${prefix}[a-z0-9-]+)`, 'g'))].map((m) => m[1] ?? ''))

// 部品の中で style 属性から与える変数。tokens.css には無くてよい
const COMPONENT_LOCAL = /^--qrcc-(sheet|cell)-/

// 段階 1 で意図的に riml-ds に寄せない qrcc 固有のトークン（値の理由は docs/adr/0011-riml-ds-tokens.md）
const KEPT_LOCAL: readonly string[] = [
  '--qrcc-radius-lg',
  '--qrcc-measure',
  '--qrcc-text-base',
  '--qrcc-text-lg',
  '--qrcc-text-xl',
  '--qrcc-text-2xl',
]

const appCssFiles = (): readonly string[] =>
  [
    ...new Glob('{shared/ui/src,features/*/ui,apps/web/src}/**/*.css').scanSync(root.pathname),
  ].toSorted()

describe('デザイントークンは riml-ds の別名', () => {
  test('tokens.css に色のリテラルが残っていない（すべて --rd-* の別名）', () => {
    expect(tokensCss).not.toMatch(/oklch\(/)
    expect(tokensCss).not.toMatch(/light-dark\(/)
  })

  test('tokens.css が参照する --rd-* は riml-ds の tokens.css か themes/qrcc.css に定義がある', () => {
    const rd = new Set([...defined(rdTokensCss, '--rd-'), ...defined(rdThemeCss, '--rd-')])
    const missing = [...used(tokensCss, '--rd-')].filter((name) => !rd.has(name))
    expect(missing).toEqual([])
  })

  test('生の値で残す --qrcc-* は KEPT_LOCAL の 6 つだけ', () => {
    // \s* は先読みの中に入れる（外に置くと 0 文字にバックトラックして先読みをすり抜ける）
    const raw = [...tokensCss.matchAll(/(--qrcc-[a-z0-9-]+)\s*:(?!\s*var\(--rd-)/g)].map(
      (m) => m[1] ?? '',
    )
    expect(raw.toSorted()).toEqual([...KEPT_LOCAL].toSorted())
  })

  test('アプリの CSS が使う --qrcc-* はすべて tokens.css に定義がある', () => {
    const names = defined(tokensCss, '--qrcc-')
    const missing = appCssFiles()
      .flatMap((file) => Array.from(used(read(new URL(file, root)), '--qrcc-')))
      .filter((name) => !names.has(name) && !COMPONENT_LOCAL.test(name))
    expect([...new Set(missing)]).toEqual([])
  })

  test('テーマの明示選択（data-theme）は残っている', () => {
    expect(tokensCss).toContain(":root[data-theme='light']")
    expect(tokensCss).toContain(":root[data-theme='dark']")
  })
})
