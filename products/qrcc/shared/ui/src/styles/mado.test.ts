import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

/**
 * 窓（Mado）の見た目が riml-ds の決めた形になっているかを CSS のテキストで検査する。
 * 実ブラウザでの層の勝ち負けは e2e/tests/mado.spec.ts が見る（docs/adr/0012-mado-look.md）。
 */
const read = (path: string | URL): string => readFileSync(path, 'utf8')
const indexCss = read(new URL('./index.css', import.meta.url))
const baseCss = read(new URL('./base.css', import.meta.url))
const componentsCss = read(new URL('./components.css', import.meta.url))
const patternsCss = read(Bun.resolveSync('@rimltempest/riml-ds-css/patterns.css', import.meta.dir))

// セレクタのブロック本文を取り出す（最初に一致したブロックだけ）
const block = (css: string, selector: string): string => {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) return ''
  const end = css.indexOf('}', start)
  return css.slice(start, end)
}

describe('窓（Mado）の見た目', () => {
  test('index.css は riml-ds の patterns.css を読み込み、rd.components を base より後・components より前に置く', () => {
    expect(indexCss).toContain("@import '@rimltempest/riml-ds-css/patterns.css';")
    const order =
      indexCss
        .match(/@layer ([^;]+);/)?.[1]
        ?.split(',')
        .map((s) => s.trim()) ?? []
    expect(order.indexOf('rd.components')).toBeGreaterThan(order.indexOf('base'))
    expect(order.indexOf('rd.components')).toBeLessThan(order.indexOf('components'))
  })

  test('index.css は riml-ds の typography.css と atoms.css も読み込む', () => {
    expect(indexCss).toContain("@import '@rimltempest/riml-ds-css/typography.css';")
    expect(indexCss).toContain("@import '@rimltempest/riml-ds-css/atoms.css';")
  })

  test('riml-ds の patterns.css は .rd-window を提供する', () => {
    expect(patternsCss).toContain('.rd-window')
    expect(patternsCss).toContain('.rd-window-title')
  })

  // 見出しの大きさ・書体は riml-ds の --rd-type-heading-N が持つ（display 書体もその中）。
  // qrcc 側で font-size / font-family を書き足さない（plan 013）
  test('h1..h4 は riml-ds の型トークン、hr は点線', () => {
    for (const [selector, token] of [
      ['h1', '--rd-type-heading-1'],
      ['h2', '--rd-type-heading-2'],
      ['h3', '--rd-type-heading-3'],
      ['h4', '--rd-type-heading-4'],
    ]) {
      const rule = block(baseCss, selector ?? '')
      expect(rule).toContain(`font: var(${token})`)
      expect(rule).not.toContain('font-size:')
      expect(rule).not.toContain('font-family:')
    }
    expect(block(baseCss, 'hr')).toMatch(/dotted/)
  })

  test('ボタンはピルで太字、枠線なし', () => {
    const button = block(componentsCss, '.qrcc-button')
    expect(button).toContain('border-radius: var(--rd-radius-full)')
    expect(button).toContain('font-weight: var(--rd-font-weight-bold)')
    expect(button).not.toContain('border: 1px solid transparent')
  })

  test('secondary は沈んだ面の塗り', () => {
    expect(block(componentsCss, ".qrcc-button[data-variant='secondary']")).toContain(
      'var(--qrcc-surface-sunken)',
    )
  })

  test('無効は色以外でも分かる（枠線が無くなっても）', () => {
    const disabled = componentsCss.slice(componentsCss.indexOf('.qrcc-button:disabled'))
    expect(disabled).toMatch(/outline|text-decoration|border/)
  })

  test('forced-colors でボタンの境界が復元される', () => {
    const fc = componentsCss.slice(componentsCss.indexOf('@media (forced-colors: active)'))
    expect(fc).toMatch(/\.qrcc-button[\s\S]*?border(-color)?: .*ButtonText/)
  })

  test('brand 色を文字色に使っていない', () => {
    for (const css of [baseCss, componentsCss]) {
      for (const line of css.split('\n')) {
        if (line.includes('rd-color-brand')) expect(line).not.toMatch(/^\s*color:/)
      }
    }
  })

  test('生の色（oklch / hex）を書いていない', () => {
    for (const css of [baseCss, componentsCss]) {
      expect(css).not.toMatch(/oklch\(|#[0-9a-f]{3,8}\b/i)
    }
  })
})
