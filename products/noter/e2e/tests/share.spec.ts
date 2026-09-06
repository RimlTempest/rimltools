import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

/**
 * 共有リンクの一周（docs/design/ux.md §4.3 §4.4 / ADR-0011）。
 *
 * ログイン画面を一度も経由しない。ホームの「Markdown で始める」を押した
 * 時点でゲストのセッションが発行され、そのまま owner になる（§6.1）。
 */

/** ホームから種別ボタンを押して 1 本作る。`/d/:id` の URL を返す。 */
const createDocument = async (page: Page, label: string): Promise<string> => {
  await page.goto('/')
  await page.getByRole('button', { name: label }).click()
  await expect(page).toHaveURL(/\/d\/doc_[0-9a-z]{24}$/)
  return page.url()
}

/**
 * 共有ダイアログを開く。
 *
 * `showModal()` はハイドレーション後にしか動かないので、押しても開かない
 * ことがある（SSR 直後の 1 瞬）。開くまで押し直す — `waitForTimeout` で
 * 「たぶん終わったころ」を待つより、実際の状態を待つほうが安定する。
 */
const openShareDialog = async (page: Page): Promise<void> => {
  await expect(async () => {
    await page.getByRole('button', { name: '共有' }).click()
    await expect(page.getByRole('radio', { name: '閲覧のみ' })).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 20_000 })
}

/** 共有ダイアログを開いてリンクを 1 本作り、その URL を返す。 */
const createShareLink = async (page: Page): Promise<string> => {
  await openShareDialog(page)
  // ゲストの owner は viewer リンクしか作れない（ADR-0010）
  await expect(page.getByRole('radio', { name: '閲覧のみ' })).toBeChecked()
  await expect(page.getByRole('radio', { name: '編集できる' })).toHaveCount(0)

  await page.getByLabel('有効期限').selectOption('7')
  await page.getByRole('button', { name: 'リンクを作成' }).click()

  const link = page.getByRole('list', { name: '有効なリンク' }).locator('code').first()
  await expect(link).toBeVisible()
  return (await link.textContent()) ?? ''
}

test('共有リンクを開いた人が閲覧者として参加する', async ({ browser, page }) => {
  await createDocument(page, 'Markdown で始める')
  const shareUrl = await createShareLink(page)
  expect(shareUrl).toMatch(/\/s\/shr_[0-9a-z]{24}$/)

  const guest = await browser.newContext()
  try {
    const joined = await guest.newPage()
    await joined.goto(shareUrl)

    // 画面は出さずに /d/:id へ送られる（ux.md §4.3）
    await expect(joined).toHaveURL(/\/d\/doc_[0-9a-z]{24}$/)
    await expect(joined.getByText('あなたの権限: 閲覧のみ')).toBeVisible()
    // viewer は表題を変えられない
    await expect(joined.getByLabel('文書のタイトル')).toHaveCount(0)
  } finally {
    await guest.close()
  }
})

test('失効したリンクは無効だと伝える', async ({ browser, page }) => {
  await createDocument(page, 'YAML で始める')
  const shareUrl = await createShareLink(page)

  await page.getByRole('button', { name: '閲覧のみのリンクを失効' }).click()
  await page.getByRole('button', { name: '失効する' }).click()
  await expect(
    page.getByText('有効なリンクはまだありません。上のボタンで作成してください。'),
  ).toBeVisible()

  const stranger = await browser.newContext()
  try {
    const blocked = await stranger.newPage()
    await blocked.goto(shareUrl)
    await expect(
      blocked.getByText('このリンクは無効です。作成者に新しいリンクを依頼してください。'),
    ).toBeVisible()
    await expect(blocked.getByRole('link', { name: '文書一覧へ戻る' })).toBeVisible()
  } finally {
    await stranger.close()
  }
})

test('非メンバーには文書の存在も知らせない', async ({ browser, page }) => {
  const documentUrl = await createDocument(page, 'JSON で始める')

  const stranger = await browser.newContext()
  try {
    const blocked = await stranger.newPage()
    const response = await blocked.goto(documentUrl)
    expect(response?.status()).toBe(404)
  } finally {
    await stranger.close()
  }
})

test('作った文書がホームの一覧に出る', async ({ page }) => {
  await createDocument(page, 'TOML で始める')
  await page.goto('/')

  const row = page.getByRole('row').filter({ hasText: 'TOML' })
  await expect(row.getByRole('link', { name: '無題' })).toBeVisible()
  await expect(row.getByText('所有者')).toBeVisible()
})
