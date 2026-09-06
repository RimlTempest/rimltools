import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

/**
 * エディタ本体（docs/design/ux.md §4.2 §5 §6.2）。
 *
 * CodeMirror は happy-dom では動かないので、実ブラウザでしか確かめられない
 * ことをここに集める: 本文が同期すること、状態ピルが「同期済み」になること、
 * 参加者が見えること、閲覧のみの人が書き換えられないこと。
 *
 * 同時編集の相手は**同じセッションの別タブ**にする。ゲストの owner は
 * 編集できる共有リンクを作れない（ADR-0010）ので、別人を editor として
 * 参加させる経路が e2e には無い。ワイヤ形式の検証は `sync.spec.ts`。
 */

const createDocument = async (page: Page, label = 'Markdown で始める'): Promise<string> => {
  await page.goto('/')
  await page.getByRole('button', { name: label }).click()
  await expect(page).toHaveURL(/\/d\/doc_[0-9a-z]{24}$/)
  return page.url()
}

/** エディタが載るのはハイドレーション後。マウントを待ってから触る。 */
const editorOf = (page: Page) => page.locator('.cm-content')

const openShareDialog = async (page: Page): Promise<void> => {
  await expect(async () => {
    await page.getByRole('button', { name: '共有' }).click()
    await expect(page.getByRole('radio', { name: '閲覧のみ' })).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 20_000 })
}

const createShareLink = async (page: Page): Promise<string> => {
  await openShareDialog(page)
  await page.getByRole('button', { name: 'リンクを作成' }).click()
  const link = page.getByRole('list', { name: '有効なリンク' }).locator('code').first()
  await expect(link).toBeVisible()
  const url = (await link.textContent()) ?? ''
  await page.getByRole('button', { name: '共有を閉じる' }).click()
  return url
}

test('開いた瞬間に本文を書ける', async ({ page }) => {
  await createDocument(page)
  const editor = editorOf(page)
  await expect(editor).toBeVisible()

  await editor.click()
  await page.keyboard.type('# 設計')
  await expect(editor).toContainText('# 設計')

  // 押すものが無いので「保存」ではなく「同期」で伝える（ux.md §5）
  await expect(page.getByText(/同期済み|同期中/)).toBeVisible()
})

test('同じ文書を開いた 2 つのタブが双方向に同期する', async ({ page }) => {
  const url = await createDocument(page)
  const other = await page.context().newPage()
  try {
    await other.goto(url)
    await expect(editorOf(other)).toBeVisible()
    await expect(editorOf(page)).toBeVisible()

    await editorOf(page).click()
    await page.keyboard.type('hello')
    await expect(editorOf(other)).toContainText('hello', { timeout: 20_000 })

    await editorOf(other).click()
    await other.keyboard.press('End')
    await other.keyboard.type(' world')
    await expect(editorOf(page)).toContainText('hello world', { timeout: 20_000 })

    // 接続できていれば、しばらくすると「同期済み · hh:mm」に落ち着く
    await expect(page.getByText(/同期済み · \d{2}:\d{2}/)).toBeVisible({ timeout: 20_000 })
  } finally {
    await other.close()
  }
})

test('一緒に開いている人が参加者として見える', async ({ page }) => {
  const url = await createDocument(page, 'YAML で始める')
  const other = await page.context().newPage()
  try {
    await other.goto(url)
    await expect(editorOf(other)).toBeVisible()

    // 自分は数えない。もう 1 タブぶんだけ出る
    await expect(page.getByRole('button', { name: '参加者 1 人' })).toBeVisible({
      timeout: 20_000,
    })
    await expect(other.getByRole('button', { name: '参加者 1 人' })).toBeVisible({
      timeout: 20_000,
    })
  } finally {
    await other.close()
  }
})

test('閲覧のみの人は読むだけで、本文を書き換えられない', async ({ browser, page }) => {
  await createDocument(page, 'JSON で始める')
  await editorOf(page).click()
  await page.keyboard.type('{"a": 1}')
  await expect(editorOf(page)).toContainText('"a"')

  const shareUrl = await createShareLink(page)

  const guest = await browser.newContext()
  try {
    const joined = await guest.newPage()
    await joined.goto(shareUrl)
    await expect(joined).toHaveURL(/\/d\/doc_[0-9a-z]{24}$/)

    await expect(joined.getByText(/閲覧のみです（.+が共有）/)).toBeVisible()
    await expect(editorOf(joined)).toContainText('"a"', { timeout: 20_000 })
    await expect(editorOf(joined)).toHaveAttribute('contenteditable', 'false')
    // 取り込みも出さない（書き換えられないので）
    await expect(joined.getByLabel('ファイルを取り込む')).toHaveCount(0)
    // 書き出しは閲覧のみでもできる
    await expect(joined.getByRole('button', { name: '端末に保存' })).toBeVisible()
  } finally {
    await guest.close()
  }
})

test('表示切替でプレビューだけにできる', async ({ page }) => {
  await createDocument(page)
  await expect(editorOf(page)).toBeVisible()

  await page.getByRole('button', { name: 'プレビューのみ' }).click()
  await expect(page.getByRole('button', { name: 'プレビューのみ' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(editorOf(page)).toBeHidden()
  // プレビュー枠（「プレビュー」）と、その中の本文（「本文のプレビュー」）を
  // 取り違えないよう完全一致で指す
  await expect(page.getByRole('region', { name: 'プレビュー', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'エディタのみ' }).click()
  await expect(editorOf(page)).toBeVisible()
})

/** AAA 2.1.2: エディタに入ったまま出られなくならないこと。 */
test('Tab でエディタから抜けられる', async ({ page }) => {
  await createDocument(page)
  await editorOf(page).click()
  await page.keyboard.type('abc')
  await page.keyboard.press('Tab')

  const stillInEditor = await page.evaluate(() =>
    Boolean(document.activeElement?.closest('.cm-content')),
  )
  expect(stillInEditor).toBe(false)
  await expect(editorOf(page)).toContainText('abc')
})

test('表題を変えると一覧にも反映される', async ({ page }) => {
  await createDocument(page)
  const title = page.getByLabel('文書のタイトル')
  await title.click()
  await title.fill('設計メモ')
  await title.press('Enter')

  await page.goto('/')
  await expect(page.getByRole('link', { name: '設計メモ' })).toBeVisible()
})
