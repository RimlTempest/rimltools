import { AxeBuilder } from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag2aaa', 'wcag21a', 'wcag21aa', 'wcag22aa'] as const

/**
 * トップページは生成と読み取りを並べて置く。同じ役割の要素が
 * 両方にあるので、この spec は**生成側のランドマークに限定**して見る。
 */
const generate = (page: Page) => page.getByRole('region', { name: 'コードを作る' })

const preview = (page: Page) => generate(page).locator('.qrcc-code-preview')

test('設定を入れるとその場で QR コードが出る', async ({ page }) => {
  await page.goto('/')
  await generate(page).getByLabel('リンク先の URL').fill('https://qrcc.riml4i.com')

  await expect(preview(page)).toBeVisible({ timeout: 15_000 })
  await expect(preview(page).locator('svg')).toBeVisible()
  // 画像だけで提供しない（WCAG 1.1.1）
  await expect(preview(page)).toContainText('URL: https://qrcc.riml4i.com')
})

/**
 * 生成のたびにサーバへ投げると Workers の無料枠を使い切る。
 * ブラウザ側 wasm で完結していることを、通信が起きないことで確かめる。
 */
test('生成でサーバに問い合わせない', async ({ page }) => {
  const serverCalls: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/_serverFn/')) serverCalls.push(request.url())
  })

  await page.goto('/')
  await expect(preview(page)).toBeVisible({ timeout: 15_000 })

  await generate(page).getByLabel('リンク先の URL').fill('https://example.com/1')
  await expect(preview(page)).toContainText('https://example.com/1')
  await generate(page)
    .getByRole('radio', { name: /H（最高）/ })
    .click()
  await expect(preview(page)).toBeVisible()

  expect(serverCalls).toEqual([])
})

test('生成結果が支援技術に伝わる @a11y', async ({ page }) => {
  await page.goto('/')
  await expect(preview(page)).toBeVisible({ timeout: 15_000 })
  await expect(preview(page).locator('svg')).toHaveAttribute('role', 'img')

  const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze()
  expect(results.violations).toEqual([])
})

test('誤り訂正レベルを上げるとコードが大きくなる', async ({ page }) => {
  await page.goto('/')
  const caption = preview(page).locator('figcaption')
  await expect(caption).toContainText('ピクセル', { timeout: 15_000 })
  const low = await caption.textContent()

  await generate(page)
    .getByRole('radio', { name: /H（最高）/ })
    .click()
  await expect(caption).not.toHaveText(low ?? '', { timeout: 15_000 })
})

test('低コントラストでも生成し、警告を読み上げる', async ({ page }) => {
  await page.goto('/')
  await expect(preview(page)).toBeVisible({ timeout: 15_000 })

  await generate(page).getByLabel('前景色').fill('#777777')
  await generate(page).getByLabel('背景色').fill('#888888')

  await expect(preview(page)).toContainText('コントラスト', { timeout: 15_000 })
  await expect(preview(page).locator('svg')).toBeVisible()
})

test('SVG と PNG で保存できる', async ({ page }) => {
  await page.goto('/')
  await expect(preview(page)).toBeVisible({ timeout: 15_000 })

  const svg = page.waitForEvent('download')
  await generate(page).getByRole('button', { name: 'SVG で保存' }).click()
  expect((await svg).suggestedFilename()).toMatch(/\.svg$/)

  const png = page.waitForEvent('download')
  await generate(page).getByRole('button', { name: 'PNG で保存' }).click()
  expect((await png).suggestedFilename()).toMatch(/\.png$/)
})

test('内容とコードの種類が合わないと、その場で理由が出る', async ({ page }) => {
  await page.goto('/')
  await generate(page).getByRole('radio', { name: 'EAN-13 / JAN' }).click()
  await expect(generate(page).getByRole('alert')).toContainText('表せません')
})

test('電話番号を選ぶと tel: 形式でプレビューに出る', async ({ page }) => {
  await page.goto('/')
  await generate(page).getByRole('radio', { name: '電話番号' }).click()
  await generate(page).getByLabel('電話番号（国番号付き）').fill('+819012345678')

  await expect(preview(page)).toContainText('電話番号: +819012345678', { timeout: 15_000 })
})

test('名刺を選ぶと氏名がプレビューに出る', async ({ page }) => {
  await page.goto('/')
  await generate(page).getByRole('radio', { name: '名刺' }).click()
  await generate(page).getByLabel('氏名').fill('山田太郎')

  await expect(preview(page)).toContainText('名刺: 山田太郎', { timeout: 15_000 })
})

test('1D バーコードでは 2D 専用の設定が消える', async ({ page }) => {
  await page.goto('/')
  await expect(generate(page).getByRole('group', { name: 'モジュールの形' })).toBeVisible()
  await generate(page).getByRole('radio', { name: 'Code 128' }).click()
  await expect(generate(page).getByRole('group', { name: 'モジュールの形' })).toBeHidden()
})

/**
 * plans/004-1d-symbologies.md: 読めるのに作れなかった 1D バーコードが、
 * 実際に作れて、内容が確認できることを確かめる（代表 2 種類）。
 */
test('Code 39 のバーコードを生成できる', async ({ page }) => {
  await page.goto('/')
  await generate(page).getByRole('radio', { name: 'テキスト' }).click()
  await generate(page).getByLabel('内容', { exact: true }).fill('CODE-39')
  await generate(page).getByRole('radio', { name: 'Code 39' }).click()

  await expect(preview(page)).toBeVisible({ timeout: 15_000 })
  await expect(preview(page).locator('svg')).toBeVisible()
  await expect(preview(page)).toContainText('テキスト: CODE-39')
})

test('EAN-8 のバーコードを生成できる', async ({ page }) => {
  await page.goto('/')
  await generate(page).getByRole('radio', { name: 'テキスト' }).click()
  await generate(page).getByLabel('内容', { exact: true }).fill('5512345')
  await generate(page).getByRole('radio', { name: 'EAN-8' }).click()

  await expect(preview(page)).toBeVisible({ timeout: 15_000 })
  await expect(preview(page).locator('svg')).toBeVisible()
  await expect(preview(page)).toContainText('テキスト: 5512345')
})
