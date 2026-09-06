import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

/**
 * 自動チェックは WCAG 違反の 3 割程度しか見つけない。
 * 残りは .claude/skills/noter-html-a11y/references/manual-checks.md の手動確認で担保する。
 */
const WCAG_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag2aaa',
  'wcag21a',
  'wcag21aa',
  'wcag22aa',
  'best-practice',
] as const

const PAGES = [
  { path: '/', name: '文書一覧' },
  { path: '/sign-in', name: 'ログイン' },
  { path: '/settings/account', name: 'アカウント設定' },
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

/**
 * ホームは visitor とゲストで別の中身になる（説明 + 4 ボタン / 一覧 + 案内）。
 * 一覧が出た状態も検査しないと、表と削除ボタンが素通りしてしまう。
 */
test('ゲストのホームに axe の違反がない @a11y', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Markdown で始める' }).click()
  await expect(page).toHaveURL(/\/d\/doc_[0-9a-z]{24}$/)
  await page.goto('/')

  await expect(page.getByRole('table', { name: '最近の文書' })).toBeVisible()
  const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze()
  expect(results.violations).toEqual([])
})

/**
 * エディタは接続できた状態（`connected`）で検査する。骨組みだけの状態を
 * 見ても、CodeMirror が載ったあとの読み上げ順は分からない。
 * `connecting` / `rejected` の検査は plan 008。
 */
test('エディタの画面に axe の違反がない @a11y', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Markdown で始める' }).click()
  await expect(page.locator('.cm-content')).toBeVisible()
  await expect(page.getByText(/同期済み|同期中/)).toBeVisible({ timeout: 20_000 })

  const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze()
  expect(results.violations).toEqual([])
})

/** 表題が `<input>` になっても、ページの見出しは 1 つ残す。 */
test('エディタの見出しが h1 から始まる @a11y', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Markdown で始める' }).click()
  await expect(page.locator('.cm-content')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
})

test('エディタが 320px 幅で横スクロールしない @a11y', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Markdown で始める' }).click()
  await expect(page.locator('.cm-content')).toBeVisible()

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflows).toBe(false)
})

test('共有ダイアログに axe の違反がない @a11y', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Markdown で始める' }).click()
  // showModal() はハイドレーション後にしか動かない。開くまで押し直す
  await expect(async () => {
    await page.getByRole('button', { name: '共有' }).click()
    await expect(page.getByRole('radio', { name: '閲覧のみ' })).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 20_000 })

  const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze()
  expect(results.violations).toEqual([])
})

test('スキップリンクを押すと本文にフォーカスが移る @a11y', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  // 飛んだだけで読み上げ位置が動かないと意味がない
  await expect(page.locator('main#main')).toBeFocused()
})

test('グローバルナビが現在地を示す @a11y', async ({ page }) => {
  await page.goto('/settings/account')
  const nav = page.getByRole('navigation', { name: 'グローバル' })
  await expect(nav.getByRole('link', { name: 'アカウント設定' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await expect(nav.getByRole('link', { name: '文書一覧' })).not.toHaveAttribute(
    'aria-current',
    'page',
  )
})

test('ナビゲーションで画面が切り替わり、見出しが更新される @a11y', async ({ page }) => {
  await page.goto('/')
  await page
    .getByRole('navigation', { name: 'グローバル' })
    .getByRole('link', { name: 'アカウント設定' })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'アカウント設定' })).toBeVisible()
})

/**
 * AAA 2.5.5。文章の中のリンクは仕様上の例外なので、
 * 単独のクリック対象（ナビゲーション・スキップリンク）だけを見る。
 */
test('単独のクリック対象が 44x44 CSS px 以上ある @a11y', async ({ page }) => {
  await page.goto('/settings/account')
  const targets = await page.locator('nav a, .noter-skip-link').all()
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
