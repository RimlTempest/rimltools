import { AxeBuilder } from '@axe-core/playwright'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

/**
 * Tab を押して目的の要素までフォーカスが届くか。
 * 途中で止まる（キーボードトラップ）と `false` になる。
 */
const tabUntilFocused = async (page: Page, target: Locator, remaining = 20): Promise<boolean> => {
  if (remaining === 0) return false
  await page.keyboard.press('Tab')
  const focused = await target.evaluate((element) => element === document.activeElement)
  return focused ? true : tabUntilFocused(page, target, remaining - 1)
}

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag2aaa', 'wcag21a', 'wcag21aa', 'wcag22aa'] as const

/**
 * Google OAuth は本物の資格情報が要るのでここでは通せない。
 * 代わりに **ゲストログインの経路**と、画面のアクセシビリティを見る。
 */

test('サインイン画面に axe の違反がない @a11y', async ({ page }) => {
  await page.goto('/sign-in')
  await expect(page.getByRole('heading', { level: 1, name: 'サインイン' })).toBeVisible()

  const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze()
  expect(results.violations).toEqual([])
})

test('パスワードもパズルも出てこない（AAA 3.3.9） @a11y', async ({ page }) => {
  await page.goto('/sign-in')
  await expect(page.locator('input[type="password"]')).toHaveCount(0)
  await expect(page.getByRole('textbox')).toHaveCount(0)
})

test('キーボードだけでゲストの選択肢まで到達して押せる @a11y', async ({ page }) => {
  await page.goto('/sign-in')
  const guest = page.getByRole('button', { name: '登録せずに使う（ゲスト）' })
  await expect(guest).toBeVisible()

  expect(await tabUntilFocused(page, guest)).toBe(true)
  await expect(guest).toBeFocused()

  await page.keyboard.press('Enter')
  await expect(page.getByRole('status')).toContainText('ゲスト', { timeout: 15_000 })
})

test('単独のクリック対象が 44x44 CSS px 以上ある @a11y', async ({ page }) => {
  await page.goto('/sign-in')
  const buttons = await page.locator('.qrcc-auth-choices .qrcc-button').all()
  expect(buttons.length).toBeGreaterThan(0)

  const measured = await Promise.all(
    buttons.map(async (button) => ({
      label: await button.textContent(),
      box: await button.boundingBox(),
    })),
  )
  for (const { label, box } of measured) {
    expect(box?.height ?? 0, `target: ${label}`).toBeGreaterThanOrEqual(44)
    expect(box?.width ?? 0, `target: ${label}`).toBeGreaterThanOrEqual(44)
  }
})

test('ゲストで使い始めると、状態と期限が画面に出る', async ({ page }) => {
  await page.goto('/sign-in')
  await page.getByRole('button', { name: '登録せずに使う（ゲスト）' }).click()

  // セッションが立つと、選択肢がサインアウトに変わる
  await expect(page.getByRole('button', { name: 'サインアウト' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('ゲストとして利用中です')).toBeVisible()
})

test('ゲストのセッションは再読み込みしても続く（HttpOnly Cookie）', async ({ page }) => {
  await page.goto('/sign-in')
  await page.getByRole('button', { name: '登録せずに使う（ゲスト）' }).click()
  await expect(page.getByRole('button', { name: 'サインアウト' })).toBeVisible({ timeout: 15_000 })

  await page.reload()
  await expect(page.getByRole('button', { name: 'サインアウト' })).toBeVisible()

  // Cookie は JavaScript から読めない（HttpOnly / ADR-0004）
  const cookies = await page.context().cookies()
  const sessionCookie = cookies.find((cookie) => cookie.name.includes('session_token'))
  expect(sessionCookie?.httpOnly).toBe(true)
  expect(sessionCookie?.sameSite).toBe('Lax')
})

test('サインアウトすると未サインインに戻る', async ({ page }) => {
  await page.goto('/sign-in')
  await page.getByRole('button', { name: '登録せずに使う（ゲスト）' }).click()
  await expect(page.getByRole('button', { name: 'サインアウト' })).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: 'サインアウト' }).click()
  await expect(page.getByRole('button', { name: '登録せずに使う（ゲスト）' })).toBeVisible({
    timeout: 15_000,
  })
})

test('ゲストの制約を選ぶ前に伝える', async ({ page }) => {
  await page.goto('/sign-in')
  const guide = page.getByRole('region', { name: 'ゲストで使うときの注意' })
  await expect(guide).toContainText('30 日')
  await expect(guide).toContainText('編集できる共有リンク')
  await expect(guide).toContainText('引き継')
})

test('サインインしなくても生成は使える（ADR-0004）', async ({ page }) => {
  await page.goto('/generate')
  await expect(page.locator('.qrcc-code-preview')).toBeVisible({ timeout: 15_000 })
})
