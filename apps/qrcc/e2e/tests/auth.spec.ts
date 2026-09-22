import { fileURLToPath } from 'node:url'
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

/** 読み取りの固定画像（scan.spec と同じもの）。 */
const SCAN_FIXTURE = fileURLToPath(new URL('../fixtures/qr-url.png', import.meta.url))

/**
 * Google OAuth は本物の資格情報が要るのでここでは通せない。
 * 代わりに **ゲストログインの経路**と、画面のアクセシビリティを見る。
 *
 * ゲストログインはローカルの D1 を使う。マイグレーションが当たっていないと
 * 何が悪いのか分からない失敗になるので、最初に確かめて案内する。
 */
test.beforeAll(async ({ request }) => {
  const response = await request.get('/api/auth/get-session')
  expect(
    response.ok(),
    'ローカルの D1 が未準備です。`cd apps/web && bunx wrangler d1 migrations apply qrcc --local` を実行してください。',
  ).toBe(true)
})

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
  // 同じ文言はヘッダーにも常駐するので、本文側に絞って見る
  await expect(page.getByRole('main').getByText('ゲストとして利用中です')).toBeVisible()
})

/** ヘッダーは全画面に出る。どのページからでも自分の状態が分かること。 */
test('サインイン状態がヘッダーにも出る', async ({ page }) => {
  await page.goto('/sign-in')
  await page.getByRole('button', { name: '登録せずに使う（ゲスト）' }).click()
  await expect(page.getByRole('button', { name: 'サインアウト' })).toBeVisible({ timeout: 15_000 })

  await page.goto('/')
  await expect(page.getByRole('banner').getByText('ゲストとして利用中です')).toBeVisible()
})

/** 常駐する live region は遷移のたびに読み上げられ、ページ側の通知とも競合する。 */
test('ヘッダーの状態表示は読み上げ領域にしない @a11y', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('banner').locator('[role="status"], output')).toHaveCount(0)
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
  await page.goto('/')
  await expect(page.locator('.qrcc-code-preview')).toBeVisible({ timeout: 15_000 })
})

/**
 * 既定の状態は**未ログイン**。訪問しただけでセッションを発行しない。
 *
 * 自動でゲストを作ると 1 訪問につき user と session で D1 に 2 行書き込みが
 * 発生し、クローラーの分まで無料枠（100k 行/日）を食う。生成も読み取りも
 * 端末内で完結するので、アカウントは**保存を始めるまで作らない**
 * （docs/free-tier-budget.md / ADR-0004）。
 */
test('トップを使ってもセッションを発行しない（D1 に書き込まない）', async ({ page }) => {
  await page.goto('/')

  const generate = page.getByRole('region', { name: 'コードを作る' })
  await generate.getByLabel('リンク先の URL').fill('https://example.com/anonymous')
  await expect(generate.locator('.qrcc-code-preview')).toContainText(
    'https://example.com/anonymous',
    { timeout: 15_000 },
  )

  const scan = page.getByRole('region', { name: 'コードを読み取る' })
  await scan.getByLabel('コードが写っている画像').setInputFiles(SCAN_FIXTURE)
  await expect(scan.getByRole('status')).toContainText('読み取りました', { timeout: 30_000 })

  // セッション Cookie が無い = D1 の session に 1 行も書いていない
  const cookies = await page.context().cookies()
  expect(
    cookies.map((cookie) => cookie.name).filter((name) => name.includes('session_token')),
  ).toEqual([])

  // 画面も「使えます」と伝えていて、サインインを促す作りになっていない
  await expect(page.getByRole('banner')).toContainText('生成と読み取りはこのまま使えます')
})
