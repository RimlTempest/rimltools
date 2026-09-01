import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag2aaa', 'wcag21a', 'wcag21aa', 'wcag22aa'] as const

test('URL から QR コードを生成できる', async ({ page }) => {
  await page.goto('/generate')
  await page.getByLabel('リンク先の URL').fill('https://qrcc.riml4i.com')
  await page.getByRole('button', { name: '生成する' }).click()

  const preview = page.locator('.qrcc-code-preview')
  await expect(preview).toBeVisible({ timeout: 15_000 })
  await expect(preview.locator('svg')).toBeVisible()
  // 画像だけで提供しない（WCAG 1.1.1）
  await expect(preview).toContainText('URL: https://qrcc.riml4i.com')
})

test('生成結果が支援技術に伝わる @a11y', async ({ page }) => {
  await page.goto('/generate')
  await page.getByRole('button', { name: '生成する' }).click()
  await expect(page.locator('.qrcc-code-preview')).toBeVisible({ timeout: 15_000 })

  // SVG 自体が名前を持つ
  await expect(page.locator('.qrcc-code-preview svg')).toHaveAttribute('role', 'img')
  // 完了が読み上げ領域に出る
  await expect(page.getByRole('status')).toContainText('生成しました')

  const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze()
  expect(results.violations).toEqual([])
})

test('誤り訂正レベルを上げるとコードが大きくなる', async ({ page }) => {
  await page.goto('/generate')
  await page.getByRole('button', { name: '生成する' }).click()
  const caption = page.locator('.qrcc-code-preview figcaption')
  await expect(caption).toContainText('ピクセル', { timeout: 15_000 })
  const low = await caption.textContent()

  await page.getByRole('radio', { name: /H（最高）/ }).click()
  await page.getByRole('button', { name: '生成する' }).click()
  await expect(caption).not.toHaveText(low ?? '', { timeout: 15_000 })
})

test('内容とコードの種類が合わないと、その場で理由が出る', async ({ page }) => {
  await page.goto('/generate')
  await page.getByRole('radio', { name: 'EAN-13 / JAN' }).click()
  await expect(page.getByRole('alert')).toContainText('表せません')
})

test('1D バーコードでは 2D 専用の設定が消える', async ({ page }) => {
  await page.goto('/generate')
  await expect(page.getByRole('group', { name: 'モジュールの形' })).toBeVisible()
  await page.getByRole('radio', { name: 'Code 128' }).click()
  await expect(page.getByRole('group', { name: 'モジュールの形' })).toBeHidden()
})
