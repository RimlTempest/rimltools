import { AxeBuilder } from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test } from '../support/test.ts'

/**
 * 共有リンクを**実際にローカル D1 に作ってから**、サインアウトして開く。
 *
 * ファイル名を `shared.spec.ts` にしないのは、`bun test shared features apps`
 * （ルートの `test` スクリプト）の引数がパスの部分一致フィルタで、
 * `shared` がこのファイルまで拾ってしまい Small テストの実行が壊れるため。
 *
 * リンクを受け取る人は qrcc のアカウントを持っていない（ADR-0004）。
 * 「作った本人のブラウザでは開ける」だけでは、その前提を確かめたことに
 * ならないので、必ずサインアウトしてから開く。
 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag2aaa', 'wcag21a', 'wcag21aa', 'wcag22aa'] as const

const SLOW = { timeout: 20_000 }

const SHARE_URL = /http:\/\/[^\s]+\/shared\/[0-9a-z]{32}/

test.beforeAll(async ({ request }) => {
  const response = await request.get('/api/auth/get-session')
  expect(
    response.ok(),
    'ローカルの D1 が未準備です。`cd services/web && bunx wrangler d1 migrations apply qrcc --local` を実行してください。',
  ).toBe(true)
})

/**
 * ハイドレーションが終わるまで待ってから開く。
 *
 * SSR された HTML には入力もボタンもあるので、待たずに触れてしまう。
 * その入力は React の state に載らないまま、ハイドレーションで消える
 * （実際「名前を入力してください」で落ちた）。読み込みが静まるまで待つ。
 */
const open = async (page: Page, path: string) => {
  await page.goto(path, { waitUntil: 'networkidle' })
}

const signInAsGuest = async (page: Page) => {
  await open(page, '/sign-in')
  await page.getByRole('button', { name: '登録せずに使う（ゲスト）' }).click()
  await expect(page.getByRole('button', { name: 'サインアウト' })).toBeVisible(SLOW)
}

const signOut = async (page: Page) => {
  await open(page, '/sign-in')
  await page.getByRole('button', { name: 'サインアウト' }).click()
  await expect(page.getByRole('button', { name: '登録せずに使う（ゲスト）' })).toBeVisible(SLOW)
}

/** 同じ D1 を共有する他のテストと取り違えないための名前。 */
const uniqueName = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`

const saveCode = async (page: Page, name: string, url = 'https://example.com') => {
  const nameField = page.getByLabel('名前', { exact: true })
  const urlField = page.getByLabel('リンク先の URL')

  await nameField.fill(name)
  await urlField.fill(url)
  // 入力が React に届いたことを確かめてから押す
  await expect(nameField).toHaveValue(name)
  await expect(urlField).toHaveValue(url)

  await page.getByRole('button', { name: '保存する' }).click()
  await expect(page.getByRole('rowheader', { name })).toBeVisible(SLOW)
}

/** ゲストで保存し、そのコードの共有リンクを 1 本作って URL を返す。 */
const shareANewCode = async (page: Page, name: string, url?: string): Promise<string> => {
  await signInAsGuest(page)
  await open(page, '/codes')
  await saveCode(page, name, url)

  await page.getByRole('link', { name }).click()
  await expect(page.getByRole('heading', { level: 2, name: '共有リンク' })).toBeVisible(SLOW)
  await page.getByRole('button', { name: '共有リンクを作る' }).click()

  const shown = page.getByText(SHARE_URL)
  await expect(shown).toBeVisible(SLOW)
  return (await shown.textContent())?.trim() ?? ''
}

test('サインアウトした人でも、共有リンクからコードを見られる', async ({ page }) => {
  const name = uniqueName('共有された在庫ラベル')
  const shareUrl = await shareANewCode(page, name)
  await signOut(page)

  await open(page, shareUrl)

  // サインインしていないことを確かめたうえで開けている
  await expect(page.getByRole('banner')).toContainText('サインインしていません')
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible(SLOW)
  // 画像だけで提供しない（WCAG 1.1.1）
  await expect(page.locator('.qrcc-code-preview')).toContainText('URL: https://example.com', SLOW)
  await expect(page.locator('.qrcc-code-preview svg')).toBeVisible()
  // 権限は説明文で伝える（色やアイコンだけにしない）
  await expect(page.getByRole('main')).toContainText('見ることだけ')
  // 保存と、自分でも作る導線
  await expect(page.getByRole('button', { name: 'SVG で保存' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'PNG で保存' })).toBeVisible()
  await expect(page.getByRole('link', { name: '自分でコードを作る' })).toBeVisible()
})

test('取り消したリンクは、作り直しを頼むよう案内する', async ({ page }) => {
  const name = uniqueName('取り消す共有')
  const shareUrl = await shareANewCode(page, name)

  await page.getByRole('button', { name: /リンクを取り消す/ }).click()
  await expect(page.getByRole('status')).toContainText('取り消しました', SLOW)
  await signOut(page)

  await open(page, shareUrl)

  await expect(
    page.getByRole('heading', { level: 1, name: 'この共有リンクは使えません' }),
  ).toBeVisible(SLOW)
  await expect(page.getByRole('main')).toContainText('新しい共有リンクを作ってもらって')
  // 取り消したのだから、コードの中身は出ない
  await expect(page.locator('.qrcc-code-preview')).toHaveCount(0)
})

test('形の違うトークンは、URL を確かめるよう案内する', async ({ page }) => {
  await open(page, '/shared/not-a-share-token')

  await expect(
    page.getByRole('heading', { level: 1, name: 'この共有リンクは形が違います' }),
  ).toBeVisible(SLOW)
  await expect(page.getByRole('main')).toContainText('途中で切れていないか')
  await expect(page.getByRole('link', { name: '自分でコードを作る' })).toBeVisible()
})

test('存在しないトークンは、取り消し・不在として案内する', async ({ page }) => {
  await open(page, '/shared/abcdefghjkmnpqrstvwxyz0123456789')

  await expect(
    page.getByRole('heading', { level: 1, name: 'この共有リンクは使えません' }),
  ).toBeVisible(SLOW)
})

test('共有された画面に axe の違反がない @a11y', async ({ page }) => {
  const name = uniqueName('検査する共有')
  const shareUrl = await shareANewCode(page, name)
  await signOut(page)

  await open(page, shareUrl)
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible(SLOW)

  const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze()
  expect(results.violations).toEqual([])
})

test('開けなかった画面にも axe の違反がない @a11y', async ({ page }) => {
  await open(page, '/shared/not-a-share-token')
  await expect(
    page.getByRole('heading', { level: 1, name: 'この共有リンクは形が違います' }),
  ).toBeVisible(SLOW)

  const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze()
  expect(results.violations).toEqual([])
})
