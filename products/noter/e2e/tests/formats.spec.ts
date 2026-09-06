import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

/**
 * 解析・診断・整形・変換・プレビュー（docs/design/ux.md §4.2、plan 006）。
 *
 * どれもブラウザの中だけで起きること（Worker を消費しない）で、CodeMirror と
 * mermaid が絡むので実ブラウザでしか確かめられない。
 */

const createDocument = async (page: Page, label: string): Promise<string> => {
  await page.goto('/')
  await page.getByRole('button', { name: label }).click()
  await expect(page).toHaveURL(/\/d\/doc_[0-9a-z]{24}$/)
  await expect(page.locator('.cm-content')).toBeVisible()
  return page.url()
}

/** 本文をそのまま置く。打鍵と違って、書いたとおりの文字が入る。 */
const importText = async (page: Page, name: string, text: string): Promise<void> => {
  await page.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: 'text/plain',
    buffer: Buffer.from(text, 'utf8'),
  })
  await page.getByRole('button', { name: '置き換える' }).click()
}

const typeInEditor = async (page: Page, text: string): Promise<void> => {
  await page.locator('.cm-content').click()
  await page.keyboard.type(text)
}

test('構文エラーが打っているそばから分かる', async ({ page }) => {
  await createDocument(page, 'JSON で始める')
  await typeInEditor(page, '{"a":1')

  await expect(page.getByRole('button', { name: '問題 1 件' })).toBeVisible()

  // 閉じ括弧を足せば、指摘は消える
  await page.keyboard.type('}')
  await expect(page.getByRole('button', { name: '問題 0 件' })).toBeVisible()
})

test('問題パネルから、その行へ移動できる', async ({ page }) => {
  await createDocument(page, 'JSON で始める')
  await typeInEditor(page, '{"a":1')

  await page.getByRole('button', { name: '問題 1 件' }).click()
  const problems = page.getByRole('region', { name: '問題' })
  const item = problems.getByRole('button', { name: /1 行目 7 列/ })
  await expect(item).toBeVisible()

  await item.click()
  const inEditor = await page.evaluate(() =>
    Boolean(document.activeElement?.closest('.cm-content')),
  )
  expect(inEditor).toBe(true)
})

test('整形すると 2 スペースのインデントになる', async ({ page }) => {
  await createDocument(page, 'JSON で始める')
  await typeInEditor(page, '{"a":1}')

  await page.getByRole('button', { name: '整形' }).click()

  const lines = page.locator('.cm-line')
  await expect(lines).toHaveCount(4)
  expect(await lines.nth(1).textContent()).toBe('  "a": 1')
})

test('markdown には整形を出さない', async ({ page }) => {
  await createDocument(page, 'Markdown で始める')
  await expect(page.getByRole('button', { name: '整形' })).toHaveCount(0)
})

test('mermaid のブロックが図になる', async ({ page }) => {
  // 分割表示になる幅で開く（狭い端末の既定はエディタのみ）
  await page.setViewportSize({ width: 1280, height: 900 })
  await createDocument(page, 'Markdown で始める')
  await importText(
    page,
    'memo.md',
    '# 図\n\n```mermaid\nflowchart TD\n  A[開始] --> B[終了]\n```\n',
  )

  const preview = page.getByRole('region', { name: '本文のプレビュー' })
  await expect(preview.getByRole('heading', { level: 1, name: '図' })).toBeVisible()

  const diagram = preview.locator('svg[role="img"]')
  await expect(diagram).toBeVisible({ timeout: 30_000 })
  await expect(diagram).toHaveAttribute('aria-label', /mermaid 図/)
  // 図が描けても、ソースは読める形で残す（docs/accessibility.md §2 の 1.1.1）
  await expect(preview.getByText('mermaid のソース')).toBeVisible()
})

test('JSON のプレビューはツリーになる', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await createDocument(page, 'JSON で始める')
  await typeInEditor(page, '{"name":"設計"}')

  const preview = page.getByRole('region', { name: '本文のプレビュー' })
  await expect(preview.getByText('name')).toBeVisible()
  await expect(preview.getByText('"設計"')).toBeVisible()
})

test('別の種別に変換して新規作成できる', async ({ page }) => {
  const url = await createDocument(page, 'JSON で始める')
  await typeInEditor(page, '{"a":1}')

  await page.getByRole('button', { name: 'YAML に変換して新規作成' }).click()

  await expect(page).toHaveURL(/\/d\/doc_[0-9a-z]{24}$/)
  await expect(page).not.toHaveURL(url)
  await expect(page.locator('.cm-content')).toContainText('a: 1', { timeout: 20_000 })
})

test('TOML にできない本文は理由を伝える', async ({ page }) => {
  await createDocument(page, 'JSON で始める')
  await typeInEditor(page, '[1,2]')

  await page.getByRole('button', { name: 'TOML に変換して新規作成' }).click()

  await expect(page.getByRole('status')).toContainText('TOML にできません')
})
