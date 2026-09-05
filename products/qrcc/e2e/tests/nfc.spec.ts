import { AxeBuilder } from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag2aaa', 'wcag21a', 'wcag21aa', 'wcag22aa'] as const

const FIXTURE_TEXT = 'https://qrcc.riml4i.com/nfc-fixture'

/**
 * `NDEFReader` を持つのは Android の Chrome だけ。CI のブラウザ（デスクトップ
 * Chromium）にはそもそも存在しないので、テストのたびに `window.NDEFReader` を
 * 偽物に差し替える。`page.addInitScript` はページのスクリプトより先に走るので、
 * アプリ側の能力検出（`'NDEFReader' in window`）が偽物を見つけられる。
 *
 * 書き込みは少し遅らせて解決する。即座に解決すると「タグを近づけてください」の
 * 読み上げが一瞬で消え、進行が読み上げられることを確かめられなくなるため。
 */
const installFakeNdefReader = (page: Page) =>
  page.addInitScript(() => {
    Reflect.set(window, 'NDEFReader', function FakeNdefReader() {
      return {
        write: (_message: unknown) =>
          new Promise((resolve) => {
            setTimeout(() => resolve(undefined), 200)
          }),
      }
    })
  })

test('非対応の環境では、使えない理由がボタンより先に出る @a11y', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))

  // CI のブラウザ（デスクトップ Chromium）には元々 NDEFReader が無いので、
  // ここでは何も差し込まず「非対応」の経路をそのまま踏む
  await page.goto('/nfc')

  await expect(page.getByText('対応していません')).toBeVisible()
  await expect(page.getByText('Android の Chrome だけ')).toBeVisible()
  await expect(page.getByRole('button')).toHaveCount(0)

  expect(consoleErrors).toEqual([])
})

test('非対応の画面に axe の違反がない @a11y', async ({ page }) => {
  await page.goto('/nfc')
  const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze()
  expect(results.violations).toEqual([])
})

test('非対応の画面が 320px 幅で横スクロールしない @a11y', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto('/nfc')
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflows).toBe(false)
})

test('グローバルナビから NFC 画面に届く', async ({ page }) => {
  await page.goto('/')
  await page
    .getByRole('navigation', { name: 'グローバル' })
    .getByRole('link', { name: 'NFC タグに書く' })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'NFC タグに書く' })).toBeVisible()
})

test.describe('対応している環境（偽の NDEFReader）', () => {
  test.beforeEach(async ({ page }) => {
    await installFakeNdefReader(page)
  })

  test('確認を経てから書き込み、進行が読み上げ領域に出る', async ({ page }) => {
    await page.goto('/nfc')

    await page.getByLabel('書き込む内容').fill(FIXTURE_TEXT)
    await page.getByRole('button', { name: '内容を確認する' }).click()

    // 書き込む前に、何を書くかと元に戻せないことが分かる
    await expect(page.getByText(FIXTURE_TEXT)).toBeVisible()
    await expect(page.getByText('元に戻せません')).toBeVisible()

    await page.getByRole('button', { name: '書き込む' }).click()

    await expect(page.getByRole('status')).toContainText('タグを近づけてください')
    await expect(page.getByRole('status')).toContainText('書き込みました')
  })

  test('対応している画面に axe の違反がない @a11y', async ({ page }) => {
    await page.goto('/nfc')
    const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze()
    expect(results.violations).toEqual([])
  })

  test('確認画面でも axe の違反がない @a11y', async ({ page }) => {
    await page.goto('/nfc')
    await page.getByLabel('書き込む内容').fill(FIXTURE_TEXT)
    await page.getByRole('button', { name: '内容を確認する' }).click()
    await expect(page.getByText(FIXTURE_TEXT)).toBeVisible()

    const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze()
    expect(results.violations).toEqual([])
  })

  test('書き込みでサーバに問い合わせない', async ({ page }) => {
    const serverCalls: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/_serverFn/')) serverCalls.push(request.url())
    })

    await page.goto('/nfc')
    await page.getByLabel('書き込む内容').fill(FIXTURE_TEXT)
    await page.getByRole('button', { name: '内容を確認する' }).click()
    await page.getByRole('button', { name: '書き込む' }).click()
    await expect(page.getByRole('status')).toContainText('書き込みました')

    expect(serverCalls).toEqual([])
  })
})
