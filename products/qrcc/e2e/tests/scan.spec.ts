import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag2aaa', 'wcag21a', 'wcag21aa', 'wcag22aa'] as const

/**
 * QR コード（内容は下の URL）の PNG。
 * `qrcc-generate` が作ったモジュール行列から直接組んだもので、
 * 生成側を変えても読み取り側のテストが道連れにならないよう画像を固定してある。
 */
const FIXTURE = fileURLToPath(new URL('../fixtures/qr-url.png', import.meta.url))
const FIXTURE_TEXT = 'https://qrcc.riml4i.com/scan-fixture'

/**
 * Wi-Fi の QR（内容は下の文字列）。この計画（plans/005）の解釈結果が
 * 表示されることを確かめるための固定画像。
 */
const WIFI_FIXTURE = fileURLToPath(new URL('../fixtures/qr-wifi.png', import.meta.url))
const WIFI_FIXTURE_TEXT = 'WIFI:S:MyNet;T:WPA;P:secret;;'

/**
 * GS1 の要素文字列（01=GTIN・17=有効期限・10=ロット）を QR に入れた固定画像。
 * 実際の GS1 バーコード（ITF-14 / GS1 DataBar）である必要はない。
 * 解釈（`interpret`）はテキストの中身だけを見るので、QR に入っていても
 * 同じように解釈されることを確かめられる。
 */
const GS1_FIXTURE = fileURLToPath(new URL('../fixtures/qr-gs1.png', import.meta.url))
const GS1_FIXTURE_TEXT = '0104912345678904172512311012345'

/** wasm デコーダは読み取り画面に入ってから取りに行くので、初回は時間がかかる。 */
const DECODE_TIMEOUT = 30_000

/**
 * トップページは生成と読み取りを並べて置く。読み上げ領域もボタンも
 * 両方にあるので、この spec は**読み取り側のランドマークに限定**して見る。
 */
const scan = (page: Page) => page.getByRole('region', { name: 'コードを読み取る' })

test('画像を選ぶと内容がテキストで出る', async ({ page }) => {
  await page.goto('/')
  await scan(page).getByLabel('コードが写っている画像').setInputFiles(FIXTURE)

  await expect(page.getByRole('link', { name: FIXTURE_TEXT })).toBeVisible({
    timeout: DECODE_TIMEOUT,
  })
  await expect(page.getByText('種類: QR コード')).toBeVisible()
})

/** plans/005: Wi-Fi の QR を読むと、解釈した内容が出て、パスワードは既定で伏せられる。 */
test('Wi-Fi の QR を読むと SSID などが解釈されて出る', async ({ page }) => {
  await page.goto('/')
  await scan(page).getByLabel('コードが写っている画像').setInputFiles(WIFI_FIXTURE)

  // 生のテキストは残る（Playwright の getByText は既定で部分一致なので、読み上げ
  // 領域にも同じ文字列が出る。以降は exact: true にして両者を混同しない）
  await expect(scan(page).getByText(WIFI_FIXTURE_TEXT, { exact: true })).toBeVisible({
    timeout: DECODE_TIMEOUT,
  })
  // 解釈した内容
  await expect(scan(page).getByText('MyNet', { exact: true })).toBeVisible()
  await expect(scan(page).getByText('WPA', { exact: true })).toBeVisible()
  await expect(scan(page).getByText('secret', { exact: true })).toBeHidden()

  await scan(page).getByRole('button', { name: 'パスワードを表示する' }).click()
  await expect(scan(page).getByText('secret', { exact: true })).toBeVisible()
})

/** plans/005: GS1 の要素文字列を読むと GTIN・有効期限・ロットが解釈されて出る。 */
test('GS1 の要素文字列を読むと GTIN などが解釈されて出る', async ({ page }) => {
  await page.goto('/')
  await scan(page).getByLabel('コードが写っている画像').setInputFiles(GS1_FIXTURE)

  // 生のテキストは残る（読み上げ領域にも同じ文字列が出るので exact: true で絞る）
  await expect(scan(page).getByText(GS1_FIXTURE_TEXT, { exact: true })).toBeVisible({
    timeout: DECODE_TIMEOUT,
  })
  // 解釈した内容（GTIN・有効期限・ロット）
  await expect(scan(page).getByText('04912345678904', { exact: true })).toBeVisible()
  await expect(scan(page).getByText('251231', { exact: true })).toBeVisible()
  await expect(scan(page).getByText('12345', { exact: true })).toBeVisible()
})

test('読み取った内容が読み上げ領域に出る', async ({ page }) => {
  await page.goto('/')
  await scan(page).getByLabel('コードが写っている画像').setInputFiles(FIXTURE)

  await expect(scan(page).getByRole('status')).toContainText('読み取りました', {
    timeout: DECODE_TIMEOUT,
  })
  await expect(scan(page).getByRole('status')).toContainText(FIXTURE_TEXT)
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

  await page.goto('/')
  await scan(page).getByLabel('コードが写っている画像').setInputFiles(FIXTURE)
  await expect(scan(page).getByRole('status')).toContainText('読み取りました', {
    timeout: DECODE_TIMEOUT,
  })

  expect(serverCalls).toEqual([])
})

test('カメラを起動すると状態が読み上げられる', async ({ page }) => {
  await page.goto('/')
  await scan(page).getByRole('button', { name: 'カメラを起動する' }).click()

  await expect(scan(page).getByRole('status')).toContainText('カメラで読み取っています', {
    timeout: DECODE_TIMEOUT,
  })
  await expect(scan(page).getByRole('button', { name: 'カメラを停止する' })).toBeVisible()

  await scan(page).getByRole('button', { name: 'カメラを停止する' }).click()
  await expect(scan(page).getByRole('status')).toContainText('カメラを停止しました')
  await expect(scan(page).getByRole('button', { name: 'カメラを起動する' })).toBeVisible()
})

/** カメラの映像は情報を持たない。支援技術には見せない（状態は live region に集約）。 */
test('カメラの映像は支援技術に見せない @a11y', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('video')).toHaveAttribute('aria-hidden', 'true')
})

test('読み取り画面に axe の違反がない @a11y', async ({ page }) => {
  await page.goto('/')
  const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze()
  expect(results.violations).toEqual([])
})

test('読み取った結果が出たあとも axe の違反がない @a11y', async ({ page }) => {
  await page.goto('/')
  await scan(page).getByLabel('コードが写っている画像').setInputFiles(FIXTURE)
  await expect(scan(page).getByRole('status')).toContainText('読み取りました', {
    timeout: DECODE_TIMEOUT,
  })

  const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze()
  expect(results.violations).toEqual([])
})

/**
 * plans/005 で足した解釈結果の表示（<dl> とパスワードの表示切り替えボタン）に
 * axe の違反が無いことも確かめる。パスワードを表示した状態でも確認する。
 */
test('Wi-Fi の解釈結果を表示しても axe の違反がない @a11y', async ({ page }) => {
  await page.goto('/')
  await scan(page).getByLabel('コードが写っている画像').setInputFiles(WIFI_FIXTURE)
  await expect(scan(page).getByRole('button', { name: 'パスワードを表示する' })).toBeVisible({
    timeout: DECODE_TIMEOUT,
  })

  const beforeReveal = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze()
  expect(beforeReveal.violations).toEqual([])

  await scan(page).getByRole('button', { name: 'パスワードを表示する' }).click()
  const afterReveal = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze()
  expect(afterReveal.violations).toEqual([])
})

/** マウスが使えなくても、カメラ起動から画像選択まで届くこと（AAA 2.1.3）。 */
test('キーボードだけでカメラと画像の両方に到達できる @a11y', async ({ page }) => {
  await page.goto('/')

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

test('読み取りはトップの h2 として置かれる @a11y', async ({ page }) => {
  await page.goto('/')
  // h1 はページの主題ひとつ。読み取りはその下の節になる（AAA 2.4.10）
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 2, name: 'コードを読み取る' })).toHaveCount(1)
})

test('読み取り画面が 320px 幅で横スクロールしない @a11y', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto('/')
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflows).toBe(false)
})

test('グローバルナビからトップに戻ると読み取りがある @a11y', async ({ page }) => {
  await page.goto('/settings')
  await page
    .getByRole('navigation', { name: 'グローバル' })
    .getByRole('link', { name: 'コードを作る・読み取る' })
    .click()
  await expect(page.getByRole('heading', { level: 2, name: 'コードを読み取る' })).toBeVisible()
})
