import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

const SLOW = { timeout: 20_000 }

/**
 * 窓（Mado）の CSS は riml-ds の patterns.css が持っていて、qrcc の base より後の
 * カスケード層（rd.components）に入る（shared/ui/src/styles/index.css）。
 * 層の順序はテキスト検査だけでは足りない — 実際にどちらが勝つかはブラウザに聞く。
 *
 * トップページに窓が出るのは plan 012 から。ここでは勝ち負けだけを確かめる。
 */
test('riml-ds の窓の CSS が qrcc の base より強い', async ({ page }) => {
  await page.goto('/')
  const margin = await page.evaluate(() => {
    const section = document.createElement('section')
    section.className = 'rd-window'
    section.innerHTML = '<h2 class="rd-window-title">t</h2><div class="rd-window-body">b</div>'
    document.body.append(section)
    const title = section.querySelector('.rd-window-title')
    return title ? getComputedStyle(title).marginBlockStart : null
  })
  expect(margin).toBe('0px') // base.css の見出し margin（--qrcc-space-8）が勝っていたら 32px になる
})

/** ゲストとしてサインインし、一覧を開く。窓の操作は保存できる状態でしか出ない。 */
const openCodesAsGuest = async (page: Page) => {
  await page.goto('/sign-in')
  await page.getByRole('button', { name: '登録せずに使う（ゲスト）' }).click()
  await expect(page.getByRole('button', { name: 'サインアウト' })).toBeVisible(SLOW)

  const listed = page.waitForResponse(
    (response) => response.url().includes('/_serverFn/') && response.request().method() === 'POST',
    { timeout: 20_000 },
  )
  await page.goto('/codes')
  await listed
}

/**
 * 窓の左端の丸は装飾ではなくボタン（riml-ds ADR-0014）。
 * たたむ（−）は本文を隠すだけで、窓そのものは残る。
 */
test('窓の たたむ で本文が隠れ、もう一度押すと戻る', async ({ page }) => {
  await openCodesAsGuest(page)

  const folders = page.getByRole('region', { name: 'フォルダ' })
  const collapse = folders.getByRole('button', { name: 'たたむ' })
  const body = folders.locator('.rd-window-body')

  await expect(collapse).toHaveAttribute('aria-expanded', 'true', SLOW)
  await expect(body).toBeVisible()

  await collapse.click()
  await expect(collapse).toHaveAttribute('aria-expanded', 'false')
  await expect(body).toBeHidden()

  // ラベルは「たたむ」のまま。状態は aria-expanded が伝える
  await collapse.click()
  await expect(collapse).toHaveAttribute('aria-expanded', 'true')
  await expect(body).toBeVisible()
})
