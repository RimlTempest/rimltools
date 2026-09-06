import type { BrowserContext, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

/**
 * 縮退したときの振る舞い（docs/design/ux.md §6.3〜§6.5 / free-tier-budget.md）。
 *
 * オフライン・削除・閲覧のみの 3 つを、実ブラウザ 2 つと本物の Durable Object で
 * 固定する。**`waitForTimeout` は使わない。** 状態が変わるのを待つ
 * （`.claude/skills/noter-tdd` §5）。
 */

/** ホームから種別ボタンを押して 1 本作る。`/d/:id` の URL を返す。 */
const createDocument = async (page: Page, label: string): Promise<string> => {
  await page.goto('/')
  await page.getByRole('button', { name: label }).click()
  await expect(page).toHaveURL(/\/d\/doc_[0-9a-z]{24}$/)
  await expect(page.locator('.cm-content')).toBeVisible()
  return page.url()
}

/**
 * 共有ダイアログを開く。`showModal()` はハイドレーション後にしか動かないので、
 * 開くまで押し直す（「たぶん終わったころ」を待つより状態を待つ）。
 */
const openShareDialog = async (page: Page): Promise<void> => {
  await expect(async () => {
    await page.getByRole('button', { name: '共有' }).click()
    await expect(page.getByRole('radio', { name: '閲覧のみ' })).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 20_000 })
}

/** 共有リンクを 1 本作る。ゲストの owner が作れるのは閲覧のみ（ADR-0010）。 */
const createShareLink = async (page: Page): Promise<string> => {
  await openShareDialog(page)
  await page.getByRole('button', { name: 'リンクを作成' }).click()
  const link = page.getByRole('list', { name: '有効なリンク' }).locator('code').first()
  await expect(link).toBeVisible()
  const url = (await link.textContent()) ?? ''
  await page.getByRole('button', { name: '共有を閉じる' }).click()
  return url
}

/** 別のブラウザから共有リンクで参加する。名前は聞かれるので名乗らずに続ける。 */
const joinAsViewer = async (context: BrowserContext, shareUrl: string): Promise<Page> => {
  const page = await context.newPage()
  await page.goto(shareUrl)
  await page.getByRole('button', { name: '名乗らずに続ける' }).click()
  await expect(page.locator('.cm-content')).toBeVisible()
  await expect(page.getByText(/同期済み|同期中/)).toBeVisible({ timeout: 20_000 })
  return page
}

const type = async (page: Page, text: string): Promise<void> => {
  await page.locator('.cm-content').click()
  await page.keyboard.type(text)
}

/**
 * ux.md §6.3。回線が切れても入力は続けられ、復帰すると相手に届く
 * （AAA 2.2.6: 中断してもデータを失わない）。
 *
 * **ピルの回復までは見ない。** Chromium のオフライン擬似では既存の
 * WebSocket が閉じないため、`online` で `reconnecting` に移ったあと
 * y-websocket から `connected` が二度と来ず、文言が「再接続中…」のまま
 * 止まる（データは流れている）。直すのは `features/sync/client` の
 * 状態遷移で、この plan の範囲外 — docs/accessibility.md §3 に記録した。
 */
test('オフラインでも入力でき、回線が戻れば相手に届く', async ({ browser, page }) => {
  test.slow()
  await createDocument(page, 'Markdown で始める')
  const shareUrl = await createShareLink(page)

  const joined = await browser.newContext()
  try {
    const viewer = await joinAsViewer(joined, shareUrl)
    await type(page, 'つながっている\n')
    await expect(viewer.locator('.cm-content')).toContainText('つながっている', {
      timeout: 20_000,
    })

    await page.context().setOffline(true)
    await expect(page.getByText('オフライン · 端末に保存')).toBeVisible({ timeout: 20_000 })

    // 切れているあいだも入力できる。相手にはまだ見えない
    await type(page, 'きれているあいだ\n')
    await expect(page.locator('.cm-content')).toContainText('きれているあいだ')
    await expect(viewer.locator('.cm-content')).not.toContainText('きれているあいだ')

    await page.context().setOffline(false)
    await expect(viewer.locator('.cm-content')).toContainText('きれているあいだ', {
      timeout: 40_000,
    })

    // 戻ったあとも、そのまま書き続けられる
    await type(page, 'もどったあと\n')
    await expect(viewer.locator('.cm-content')).toContainText('もどったあと', { timeout: 20_000 })
  } finally {
    await joined.close()
  }
})

/**
 * ux.md §4.2 の削除。開いたままの人は次に読み込んだ時点で入れなくなる
 * （非メンバーと同じ 404。存在の有無を区別させない）。
 */
test('削除された文書は開き直せなくなる', async ({ browser, page }) => {
  const documentUrl = await createDocument(page, 'Markdown で始める')
  const shareUrl = await createShareLink(page)

  const joined = await browser.newContext()
  try {
    const viewer = await joinAsViewer(joined, shareUrl)

    await page.locator('summary', { hasText: 'その他の操作' }).click()
    await page.getByRole('button', { name: 'この文書を削除' }).click()
    await page.getByRole('button', { name: '削除する' }).click()
    await expect(page).toHaveURL('/')

    const reloaded = await viewer.goto(documentUrl)
    expect(reloaded?.status()).toBe(404)
    await expect(viewer.locator('.cm-content')).toHaveCount(0)
  } finally {
    await joined.close()
  }
})

/**
 * ux.md §4.2 の閲覧のみ。読めるが書けない。**書けないことを画面で伝える**
 * （権限の表示と、編集の道具を出さないこと）。
 */
test('閲覧のみの人は本文を変えられない', async ({ browser, page }) => {
  await createDocument(page, 'JSON で始める')
  const shareUrl = await createShareLink(page)

  const joined = await browser.newContext()
  try {
    const viewer = await joinAsViewer(joined, shareUrl)

    await expect(viewer.getByText('あなたの権限: 閲覧のみ')).toBeVisible()
    await expect(viewer.locator('.cm-content')).toHaveAttribute('contenteditable', 'false')
    // 整形は本文を書き換える操作。閲覧のみの人には出さない
    await expect(viewer.getByRole('button', { name: '整形' })).toHaveCount(0)
    await expect(viewer.getByRole('textbox', { name: '文書のタイトル' })).toHaveCount(0)

    // 経路が生きていることを先に示す（owner の入力は届く）
    await type(page, '"かきこめる"')
    await expect(viewer.locator('.cm-content')).toContainText('かきこめる', { timeout: 20_000 })

    // 閲覧のみの人が打っても、相手には現れない
    await type(viewer, 'よめるだけ')
    await expect(page.locator('.cm-content')).not.toContainText('よめるだけ', { timeout: 2000 })
    await expect(viewer.locator('.cm-content')).not.toContainText('よめるだけ')
  } finally {
    await joined.close()
  }
})
