import { AxeBuilder } from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag2aaa', 'wcag21a', 'wcag21aa', 'wcag22aa'] as const

/** 1mm は 96dpi 換算で 3.7795px。台紙の寸法が CSS まで届いているかを見る。 */
const mm = (value: number) => (value * 96) / 25.4

const sheet = (page: Page) => page.locator('.qrcc-print-sheet')
const cells = (page: Page) => page.locator('.qrcc-print-cell')
const labelCells = (page: Page) => page.locator('.qrcc-print-cell[data-cell="label"]')

const waitForPreview = async (page: Page) => {
  await expect(sheet(page).first()).toBeVisible({ timeout: 15_000 })
  await expect(labelCells(page).first().locator('svg')).toBeVisible({ timeout: 15_000 })
}

test('既定の台紙にコードが面付けされて出る', async ({ page }) => {
  await page.goto('/print')
  await waitForPreview(page)

  // A4 24 面 = 3 列 8 行。空きセルも含めて台紙 1 枚ぶんが並ぶ
  await expect(cells(page)).toHaveCount(24)
  await expect(labelCells(page)).toHaveCount(1)
})

/** 寸法は features/print/core/sheets/ が定義元。CSS に書き写していない。 */
test('台紙とセルが台紙定義どおりのミリ寸法で並ぶ', async ({ page }) => {
  await page.goto('/print')
  await waitForPreview(page)

  const sheetBox = await sheet(page).first().boundingBox()
  expect(sheetBox?.width ?? 0).toBeCloseTo(mm(210), 0)
  expect(sheetBox?.height ?? 0).toBeCloseTo(mm(297), 0)

  const cellBox = await cells(page).first().boundingBox()
  expect(cellBox?.width ?? 0).toBeCloseTo(mm(70), 0)
  expect(cellBox?.height ?? 0).toBeCloseTo(mm(33.9), 0)
})

test('台紙を変えると面数と 1 面の大きさが変わる', async ({ page }) => {
  await page.goto('/print')
  await waitForPreview(page)

  await page.getByLabel('ラベル台紙').selectOption('a4-65-38.1x21.2')
  await expect(cells(page)).toHaveCount(65)

  const cellBox = await cells(page).first().boundingBox()
  expect(cellBox?.width ?? 0).toBeCloseTo(mm(38.1), 0)
})

/** 使いかけの台紙を無駄にしないための、この画面の要。 */
test('開始セルを指定すると、その手前が空きセルになる', async ({ page }) => {
  await page.goto('/print')
  await waitForPreview(page)

  await page.getByLabel('印刷を始めるセル').fill('5')
  await expect(cells(page).nth(4).locator('svg')).toBeVisible({ timeout: 15_000 })
  await expect(cells(page).nth(0)).toHaveAttribute('data-cell', 'blank')
  await expect(labelCells(page)).toHaveCount(1)
})

test('枚数を増やすとページを跨いで並ぶ', async ({ page }) => {
  await page.goto('/print')
  await waitForPreview(page)

  await page.getByLabel('1 つのコードあたりの枚数').fill('25')
  await expect(sheet(page)).toHaveCount(2)
  await expect(labelCells(page)).toHaveCount(25)
})

/**
 * 画面で見たものが刷られること（ADR-0005）。
 * 面付けの規則は @media print の外にあるので、寸法は媒体で変わらない。
 */
test('印刷スタイルでも面付けの寸法が変わらない', async ({ page }) => {
  await page.goto('/print')
  await waitForPreview(page)
  const onScreen = await cells(page).first().boundingBox()

  await page.emulateMedia({ media: 'print' })
  const onPaper = await cells(page).first().boundingBox()

  expect(onPaper?.width ?? 0).toBeCloseTo(onScreen?.width ?? -1, 1)
  expect(onPaper?.height ?? 0).toBeCloseTo(onScreen?.height ?? -1, 1)
})

/** 設定やナビが刷られると 1 ページ余分に出て、使いかけの台紙が無駄になる。 */
test('印刷では台紙だけが残り、アプリの外枠は消える', async ({ page }) => {
  await page.goto('/print')
  await waitForPreview(page)

  await page.emulateMedia({ media: 'print' })
  // 窓の帯も <header> なので、ページの外枠はランドマーク（banner）で取る
  await expect(page.getByRole('banner')).toBeHidden()
  await expect(page.getByRole('button', { name: '印刷する' })).toBeHidden()
  await expect(sheet(page).first()).toBeVisible()
  // 紙の上でも内容が文字で読める（WCAG 1.1.1）
  await expect(sheet(page).first()).toContainText('https://qrcc.riml4i.com')
})

/**
 * 1 回の印刷で数十枚ぶんを生成する。サーバに投げると無料枠を使い切るので、
 * 通信が起きないことで端末内で完結していることを確かめる。
 */
test('印刷用の生成でサーバに問い合わせない', async ({ page }) => {
  const serverCalls: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/_serverFn/')) serverCalls.push(request.url())
  })

  await page.goto('/print')
  await waitForPreview(page)
  await page.getByLabel('1 つのコードあたりの枚数').fill('4')
  await expect(labelCells(page)).toHaveCount(4)

  expect(serverCalls).toEqual([])
})

test('印刷画面に axe の違反がない @a11y', async ({ page }) => {
  await page.goto('/print')
  await waitForPreview(page)

  const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze()
  expect(results.violations).toEqual([])
})

test('印刷画面が 320px 幅で横スクロールしない @a11y', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto('/print')
  await waitForPreview(page)

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflows).toBe(false)
})

/** AAA 2.5.5。単独のクリック対象は 44x44 CSS px 以上。 */
test('印刷画面の設定が 44x44 CSS px 以上ある @a11y', async ({ page }) => {
  await page.goto('/print')
  await waitForPreview(page)

  const targets = [
    { name: 'ラベル台紙', locator: page.getByLabel('ラベル台紙') },
    { name: '印刷を始めるセル', locator: page.getByLabel('印刷を始めるセル') },
    { name: '枚数', locator: page.getByLabel('1 つのコードあたりの枚数') },
    { name: '印刷する', locator: page.getByRole('button', { name: '印刷する' }) },
  ]
  const measured = await Promise.all(
    targets.map(async (target) => ({ name: target.name, box: await target.locator.boundingBox() })),
  )
  for (const { name, box } of measured) {
    expect(box?.height ?? 0, `target: ${name}`).toBeGreaterThanOrEqual(44)
    expect(box?.width ?? 0, `target: ${name}`).toBeGreaterThanOrEqual(44)
  }
})
