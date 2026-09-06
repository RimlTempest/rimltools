import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

/**
 * PWA として成立していることを確かめる。
 *
 * 目玉は「オフラインでも生成が動く」（5）。ここが落ちるならこの計画に
 * 価値は無い（plans/009-pwa.md）。「/codes がオフラインでキャッシュから
 * 復元されない」（6）はその安全側の対で、両方が通って初めて計画は完了する。
 */

const preview = (page: Page) =>
  page.getByRole('region', { name: 'コードを作る' }).locator('.qrcc-code-preview')

test('manifest が公開され、必要な項目を含む', async ({ page }) => {
  const response = await page.request.get('/manifest.webmanifest')
  expect(response.ok()).toBe(true)

  const manifest: unknown = await response.json()
  if (typeof manifest !== 'object' || manifest === null) {
    throw new Error('manifest.webmanifest が JSON オブジェクトではない')
  }
  expect(Reflect.get(manifest, 'name')).toContain('qrcc')
  expect(Reflect.get(manifest, 'start_url')).toBe('/')
  const icons: unknown = Reflect.get(manifest, 'icons')
  expect(Array.isArray(icons) ? icons.length : 0).toBeGreaterThan(0)
})

test('アイコン 4 つがすべて 200 で、中身が空でない', async ({ page }) => {
  const paths = [
    '/icon-192.png',
    '/icon-512.png',
    '/icon-maskable-512.png',
    '/apple-touch-icon.png',
  ]

  await Promise.all(
    paths.map(async (path) => {
      const response = await page.request.get(path)
      expect(response.ok(), path).toBe(true)
      const body = await response.body()
      expect(body.length, path).toBeGreaterThan(0)
    }),
  )
})

test('<head> に manifest へのリンクが出る', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    '/manifest.webmanifest',
  )
})

test('Service Worker が登録され、ページを制御する状態になる', async ({ page }) => {
  await page.goto('/')
  // 初回の読み込みでは登録するだけで、このページ自身は制御しない
  // （skipWaiting も clients.claim も呼ばない設計のため）。
  // 有効化を待ってから開き直すと、次のナビゲーションから制御下に入る
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
})

test('オフラインにしても生成が動く', async ({ page, context }) => {
  await page.goto('/')
  await page.evaluate(() => navigator.serviceWorker.ready)
  // SW に制御された状態で読み込み直し、静的アセット（wasm を含む）と
  // トップページの HTML をキャッシュさせる
  await page.reload()
  await expect(preview(page)).toBeVisible({ timeout: 15_000 })

  await context.setOffline(true)
  await page.reload()
  await expect(preview(page)).toBeVisible({ timeout: 15_000 })
  await expect(preview(page).locator('svg')).toBeVisible()

  await context.setOffline(false)
})

test('/codes の HTML はオフラインでキャッシュから復元されない', async ({ page, context }) => {
  await page.goto('/codes')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: '保存したコード' })).toBeVisible()

  // 利用者のデータが載るページなので、キャッシュへ保存すらしていない。
  // オフラインでの再読み込みはネットワークエラーとして失敗する
  // （成功してしまったら、前の利用者のデータが次の人に見える事故になる）
  await context.setOffline(true)
  await expect(page.reload()).rejects.toThrow()

  await context.setOffline(false)
})
