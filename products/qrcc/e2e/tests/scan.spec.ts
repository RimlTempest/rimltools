import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag2aaa', 'wcag21a', 'wcag21aa', 'wcag22aa'] as const

/**
 * QR コード（内容は下の URL）の PNG。
 * `qrcc-generate` が作ったモジュール行列から直接組んだもので、
 * 生成側を変えても読み取り側のテストが道連れにならないよう画像を固定してある。
 */
const FIXTURE = fileURLToPath(new URL('../fixtures/qr-url.png', import.meta.url))
const FIXTURE_TEXT = 'https://qrcc.riml4i.com/scan-fixture'

/** wasm デコーダは読み取り画面に入ってから取りに行くので、初回は時間がかかる。 */
const DECODE_TIMEOUT = 30_000

test('画像を選ぶと内容がテキストで出る', async ({ page }) => {
  await page.goto('/scan')
  await page.getByLabel('コードが写っている画像').setInputFiles(FIXTURE)

  await expect(page.getByRole('link', { name: FIXTURE_TEXT })).toBeVisible({
    timeout: DECODE_TIMEOUT,
  })
  await expect(page.getByText('種類: QR コード')).toBeVisible()
})

test('読み取った内容が読み上げ領域に出る', async ({ page }) => {
  await page.goto('/scan')
  await page.getByLabel('コードが写っている画像').setInputFiles(FIXTURE)

  await expect(page.getByRole('status')).toContainText('読み取りました', {
    timeout: DECODE_TIMEOUT,
  })
  await expect(page.getByRole('status')).toContainText(FIXTURE_TEXT)
})

/**
 * 画像をサーバに送らないことを、通信が起きないことで確かめる
 * （docs/architecture.md / docs/free-tier-budget.md）。
 */
test('読み取りでサーバに問い合わせない', async ({ page }) => {
  const serverCalls: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    if (url.includes('/_serverFn/') || request.method() === 'POST') serverCalls.push(url)
  })

  await page.goto('/scan')
  await page.getByLabel('コードが写っている画像').setInputFiles(FIXTURE)
  await expect(page.getByRole('status')).toContainText('読み取りました', {
    timeout: DECODE_TIMEOUT,
  })

  expect(serverCalls).toEqual([])
})

test('カメラを起動すると状態が読み上げられる', async ({ page }) => {
  await page.goto('/scan')
  await page.getByRole('button', { name: 'カメラを起動する' }).click()

  await expect(page.getByRole('status')).toContainText('カメラで読み取っています', {
    timeout: DECODE_TIMEOUT,
  })
  await expect(page.getByRole('button', { name: 'カメラを停止する' })).toBeVisible()

  await page.getByRole('button', { name: 'カメラを停止する' }).click()
  await expect(page.getByRole('status')).toContainText('カメラを停止しました')
  await expect(page.getByRole('button', { name: 'カメラを起動する' })).toBeVisible()
})

/** カメラの映像は情報を持たない。支援技術には見せない（状態は live region に集約）。 */
test('カメラの映像は支援技術に見せない @a11y', async ({ page }) => {
  await page.goto('/scan')
  await expect(page.locator('video')).toHaveAttribute('aria-hidden', 'true')
})

test('読み取り画面に axe の違反がない @a11y', async ({ page }) => {
  await page.goto('/scan')
  const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze()
  expect(results.violations).toEqual([])
})

test('読み取った結果が出たあとも axe の違反がない @a11y', async ({ page }) => {
  await page.goto('/scan')
  await page.getByLabel('コードが写っている画像').setInputFiles(FIXTURE)
  await expect(page.getByRole('status')).toContainText('読み取りました', {
    timeout: DECODE_TIMEOUT,
  })

  const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze()
  expect(results.violations).toEqual([])
})

/** マウスが使えなくても、カメラ起動から画像選択まで届くこと（AAA 2.1.3）。 */
test('キーボードだけでカメラと画像の両方に到達できる @a11y', async ({ page }) => {
  await page.goto('/scan')

  const describeFocus = () =>
    page.evaluate(() => {
      const active = document.activeElement
      if (active === null) return ''
      const type = active.getAttribute('type') ?? ''
      return `${active.tagName.toLowerCase()}:${type}:${active.textContent ?? ''}`
    })

  // Tab は順序が意味を持つので、まとめて並列に押すことはできない
  const focusTrail = async (steps: number): Promise<readonly string[]> => {
    if (steps === 0) return []
    await page.keyboard.press('Tab')
    const current = await describeFocus()
    const rest = await focusTrail(steps - 1)
    return [current, ...rest]
  }

  const reachable = await focusTrail(20)
  expect(reachable.some((entry) => entry.includes('カメラを起動する'))).toBe(true)
  expect(reachable.some((entry) => entry.startsWith('input:file'))).toBe(true)
})

test('読み取り画面の見出しが h1 から始まる @a11y', async ({ page }) => {
  await page.goto('/scan')
  await expect(page.getByRole('heading', { level: 1, name: 'コードを読み取る' })).toHaveCount(1)
})

test('読み取り画面が 320px 幅で横スクロールしない @a11y', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto('/scan')
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflows).toBe(false)
})

test('グローバルナビから読み取り画面に行ける @a11y', async ({ page }) => {
  await page.goto('/')
  await page
    .getByRole('navigation', { name: 'グローバル' })
    .getByRole('link', { name: 'コードを読み取る' })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'コードを読み取る' })).toBeVisible()
})
