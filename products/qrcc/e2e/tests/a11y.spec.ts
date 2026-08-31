import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

/**
 * 自動チェックは WCAG 違反の 3 割程度しか見つけない。
 * 残りは .claude/skills/qrcc-html-a11y/references/manual-checks.md の手動確認で担保する。
 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag2aaa', 'wcag21a', 'wcag21aa', 'wcag22aa'] as const

const PAGES = [{ path: '/', name: 'トップ' }] as const

for (const target of PAGES) {
  test(`${target.name} に axe の違反がない @a11y`, async ({ page }) => {
    await page.goto(target.path)
    const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze()
    expect(results.violations).toEqual([])
  })

  test(`${target.name} でスキップリンクがキーボードで到達できる @a11y`, async ({ page }) => {
    await page.goto(target.path)
    await page.keyboard.press('Tab')
    const focused = page.locator(':focus')
    await expect(focused).toHaveText('本文へスキップ')
  })

  test(`${target.name} が 320px 幅で横スクロールしない @a11y`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await page.goto(target.path)
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflows).toBe(false)
  })

  test(`${target.name} の見出しが h1 から始まる @a11y`, async ({ page }) => {
    await page.goto(target.path)
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  })
}
