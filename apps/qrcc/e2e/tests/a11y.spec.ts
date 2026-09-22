import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '../support/test.ts'

/**
 * 自動チェックは WCAG 違反の 3 割程度しか見つけない。
 * 残りは .claude/skills/rimltools-html-a11y/references/manual-checks.md の手動確認で担保する。
 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag2aaa', 'wcag21a', 'wcag21aa', 'wcag22aa'] as const

const PAGES = [
  // トップが生成と読み取りを兼ねる
  { path: '/', name: 'トップ' },
  { path: '/settings', name: '設定' },
] as const

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

test('スキップリンクを押すと本文にフォーカスが移る @a11y', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  // 飛んだだけで読み上げ位置が動かないと意味がない
  await expect(page.locator('main#main')).toBeFocused()
})

test('グローバルナビが現在地を示す @a11y', async ({ page }) => {
  await page.goto('/settings')
  const nav = page.getByRole('navigation', { name: 'グローバル' })
  await expect(nav.getByRole('link', { name: '設定' })).toHaveAttribute('aria-current', 'page')
  await expect(nav.getByRole('link', { name: 'コードを作る・読み取る' })).not.toHaveAttribute(
    'aria-current',
    'page',
  )
})

test('ナビゲーションで画面が切り替わり、見出しが更新される @a11y', async ({ page }) => {
  await page.goto('/')
  await page
    .getByRole('navigation', { name: 'グローバル' })
    .getByRole('link', { name: '設定' })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: '設定' })).toBeVisible()
})

/**
 * AAA 2.5.5。文章の中のリンクは仕様上の例外なので、
 * 単独のクリック対象（ナビゲーション・スキップリンク）だけを見る。
 */
test('単独のクリック対象が 44x44 CSS px 以上ある @a11y', async ({ page }) => {
  await page.goto('/settings')
  const targets = await page.locator('nav a, .qrcc-skip-link').all()
  expect(targets.length).toBeGreaterThan(0)

  const measured = await Promise.all(
    targets.map(async (target) => ({
      label: await target.textContent(),
      box: await target.boundingBox(),
    })),
  )
  for (const { label, box } of measured) {
    expect(box?.height ?? 0, `target: ${label}`).toBeGreaterThanOrEqual(44)
    expect(box?.width ?? 0, `target: ${label}`).toBeGreaterThanOrEqual(44)
  }
})
