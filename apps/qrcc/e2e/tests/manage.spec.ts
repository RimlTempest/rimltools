import { AxeBuilder } from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test } from '../support/test.ts'

/**
 * 保存・一覧・編集・共有・削除を、ローカル Miniflare の D1 に対して通す。
 *
 * ゲストでサインインしてから操作する。テストごとにブラウザコンテキストが
 * 分かれるので、ゲストも 1 テストにつき 1 人になり、データが混ざらない。
 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag2aaa', 'wcag21a', 'wcag21aa', 'wcag22aa'] as const

const SLOW = { timeout: 20_000 }

test.beforeAll(async ({ request }) => {
  const response = await request.get('/api/auth/get-session')
  expect(
    response.ok(),
    'ローカルの D1 が未準備です。`cd services/web && bunx wrangler d1 migrations apply qrcc --local` を実行してください。',
  ).toBe(true)
})

/** ゲストとしてサインインし、保存できる状態にする。 */
const signInAsGuest = async (page: Page) => {
  await page.goto('/sign-in')
  await page.getByRole('button', { name: '登録せずに使う（ゲスト）' }).click()
  await expect(page.getByRole('button', { name: 'サインアウト' })).toBeVisible(SLOW)
}

/**
 * 一覧を開き、ブラウザ側の読み込みが終わるまで待つ。
 *
 * 一覧の取得はハイドレーション後の effect で走るので、その応答が返れば
 * 画面は操作できる状態になっている。待たずにフォームを送ると、React では
 * なくブラウザがそのまま送信してしまい、操作が黙って失われる。
 */
const openCodes = async (page: Page) => {
  const listed = page.waitForResponse(
    (response) => response.url().includes('/_serverFn/') && response.request().method() === 'POST',
    { timeout: 20_000 },
  )
  await page.goto('/codes')
  await listed
}

/** 一意な名前。同じ D1 を共有する他のテストと取り違えないようにする。 */
const uniqueName = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`

const saveCode = async (page: Page, name: string, url = 'https://example.com') => {
  await page.getByLabel('名前', { exact: true }).fill(name)
  await page.getByLabel('リンク先の URL').fill(url)
  await page.getByRole('button', { name: '保存する' }).click()
  await expect(page.getByRole('rowheader', { name })).toBeVisible(SLOW)
}

test('未サインインでは保存にサインインが必要だと案内する', async ({ page }) => {
  await page.goto('/codes')
  await expect(page.getByRole('heading', { level: 1, name: '保存したコード' })).toBeVisible()
  await expect(page.getByRole('main')).toContainText('サインインが必要')
  // 生成と読み取りは従来どおり使えることも伝える（ADR-0004）
  await expect(page.getByRole('main')).toContainText('生成と読み取り')
  await expect(page.getByRole('main').getByRole('link', { name: /サインイン/ })).toBeVisible()
})

test('保存したコードが D1 に残り、一覧に出る', async ({ page }) => {
  await signInAsGuest(page)
  await openCodes(page)

  const name = uniqueName('在庫ラベル')
  await saveCode(page, name)

  // 読み込み直しても残っている（保存されたのがブラウザの状態ではないこと）
  await page.reload()
  await expect(page.getByRole('rowheader', { name })).toBeVisible(SLOW)
})

test('名前で検索して絞り込める', async ({ page }) => {
  await signInAsGuest(page)
  await openCodes(page)

  const kept = uniqueName('のこす')
  const filtered = uniqueName('けす')
  await saveCode(page, kept)
  await saveCode(page, filtered)

  await page.getByLabel('名前で検索').fill(kept)
  await page.getByRole('button', { name: '検索する' }).click()

  await expect(page.getByRole('rowheader', { name: kept })).toBeVisible(SLOW)
  await expect(page.getByRole('rowheader', { name: filtered })).toHaveCount(0)
})

test('列見出しで並べ替えると aria-sort が変わる', async ({ page }) => {
  await signInAsGuest(page)
  await openCodes(page)
  await saveCode(page, uniqueName('並べ替え'))

  const nameHeader = page.getByRole('columnheader', { name: /名前/ })
  await expect(nameHeader).toHaveAttribute('aria-sort', 'none')

  await page.getByRole('button', { name: /^名前/ }).click()
  await expect(nameHeader).toHaveAttribute('aria-sort', 'ascending', SLOW)

  await page.getByRole('button', { name: /^名前/ }).click()
  await expect(nameHeader).toHaveAttribute('aria-sort', 'descending', SLOW)
})

test('フォルダを作ると絞り込みに出る', async ({ page }) => {
  await signInAsGuest(page)
  await openCodes(page)

  const folder = uniqueName('仕事')
  await page.getByLabel('新しいフォルダの名前').fill(folder)
  await page.getByRole('button', { name: 'フォルダを作る' }).click()

  await expect(page.getByLabel('フォルダで絞り込む')).toContainText(folder, SLOW)
})

test('編集画面で名前を直すと一覧にも反映される', async ({ page }) => {
  await signInAsGuest(page)
  await openCodes(page)

  const before = uniqueName('編集まえ')
  const after = uniqueName('編集あと')
  await saveCode(page, before)

  await page.getByRole('link', { name: before }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'コードを編集' })).toBeVisible(SLOW)
  await expect(page.getByLabel('名前', { exact: true })).toHaveValue(before, SLOW)

  await page.getByLabel('名前', { exact: true }).fill(after)
  await page.getByRole('button', { name: '保存する' }).click()
  await expect(page.getByRole('status')).toContainText('保存しました', SLOW)

  await openCodes(page)
  await expect(page.getByRole('rowheader', { name: after })).toBeVisible(SLOW)
})

/**
 * プレビューはブラウザ側の wasm で作る。設定を触るたびにサーバへ投げると
 * Workers のリクエスト無料枠を使い切る（docs/free-tier-budget.md）。
 */
test('編集画面で設定を変えると、その場でプレビューが更新される', async ({ page }) => {
  await signInAsGuest(page)
  await openCodes(page)

  const name = uniqueName('プレビュー')
  await saveCode(page, name, 'https://example.com/before')
  await page.getByRole('link', { name }).click()

  const preview = page.locator('.qrcc-code-preview')
  await expect(preview).toBeVisible(SLOW)
  await expect(preview.locator('svg')).toBeVisible()
  // 画像だけで提供しない（WCAG 1.1.1）
  await expect(preview).toContainText('URL: https://example.com/before')

  // ここから先は端末の中だけで完結する（server function を呼ばない）
  const serverCalls: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/_serverFn/')) serverCalls.push(request.url())
  })

  await page.getByLabel('リンク先の URL').fill('https://example.com/after')
  await expect(preview).toContainText('URL: https://example.com/after', SLOW)
  expect(serverCalls).toEqual([])
})

test('フォルダの名前を変えられる', async ({ page }) => {
  await signInAsGuest(page)
  await openCodes(page)

  const before = uniqueName('しごと')
  const after = uniqueName('しゅみ')
  await page.getByLabel('新しいフォルダの名前').fill(before)
  await page.getByRole('button', { name: 'フォルダを作る' }).click()
  await expect(page.getByLabel(`「${before}」の新しい名前`)).toBeVisible(SLOW)

  await page.getByLabel(`「${before}」の新しい名前`).fill(after)
  await page.getByRole('button', { name: `「${before}」の名前を保存` }).click()
  await expect(page.getByRole('status')).toContainText(after, SLOW)

  // 読み込み直しても新しい名前のまま（D1 に届いている）
  await page.reload()
  await expect(page.getByLabel('フォルダで絞り込む')).toContainText(after, SLOW)
  await expect(page.getByLabel('フォルダで絞り込む')).not.toContainText(before)
})

/** 入れ物を捨てても中身は捨てない（D1 の ON DELETE SET NULL）。 */
test('フォルダを削除しても中のコードは残り、フォルダ未設定になる', async ({ page }) => {
  await signInAsGuest(page)
  await openCodes(page)

  const folderName = uniqueName('入れ物')
  const codeName = uniqueName('中身')
  await page.getByLabel('新しいフォルダの名前').fill(folderName)
  await page.getByRole('button', { name: 'フォルダを作る' }).click()
  await expect(page.getByLabel(`「${folderName}」の新しい名前`)).toBeVisible(SLOW)

  // 絞り込みで選んでいるフォルダに保存される
  await page.getByLabel('フォルダで絞り込む').selectOption({ label: folderName })
  await saveCode(page, codeName)
  const row = page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: codeName }) })
  await expect(row).toContainText(folderName, SLOW)

  // 消す前に、中のコードがどうなるかを伝える
  await page.getByRole('button', { name: `「${folderName}」を削除` }).click()
  await expect(page.getByRole('dialog')).toContainText('コードは削除されません')
  await page.getByRole('button', { name: 'フォルダを削除する' }).click()

  await expect(page.getByRole('status')).toContainText('コードは残っています', SLOW)
  await expect(page.getByLabel('フォルダで絞り込む')).not.toContainText(folderName)
  await expect(row).toBeVisible(SLOW)
  await expect(row).toContainText('なし')

  await page.reload()
  await expect(
    page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: codeName }) }),
  ).toBeVisible(SLOW)
})

test('共有リンクを作って取り消せる', async ({ page }) => {
  await signInAsGuest(page)
  await openCodes(page)

  const name = uniqueName('共有')
  await saveCode(page, name)
  await page.getByRole('link', { name }).click()
  await expect(page.getByRole('heading', { level: 2, name: '共有リンク' })).toBeVisible(SLOW)

  await page.getByRole('button', { name: '共有リンクを作る' }).click()
  const url = page.getByText(/\/shared\/[0-9a-z]{32}/)
  await expect(url).toBeVisible(SLOW)

  await page.getByRole('button', { name: /リンクを取り消す/ }).click()
  await expect(page.getByRole('status')).toContainText('取り消しました', SLOW)
  await expect(page.getByText(/\/shared\/[0-9a-z]{32}/)).toHaveCount(0)
})

/** ゲストの制約（ADR-0004）。押せる形にしてから断るのではなく、先に示す。 */
test('ゲストは編集できる共有リンクを選べない', async ({ page }) => {
  await signInAsGuest(page)
  await openCodes(page)

  const name = uniqueName('ゲスト共有')
  await saveCode(page, name)
  await page.getByRole('link', { name }).click()
  await expect(page.getByRole('heading', { level: 2, name: '共有リンク' })).toBeVisible(SLOW)

  await expect(page.getByLabel('編集もできる')).toBeDisabled()
  await expect(page.getByRole('main')).toContainText('ゲストのままでは')
})

test('削除は確認を挟み、あとから取り消せる', async ({ page }) => {
  await signInAsGuest(page)
  await openCodes(page)

  const name = uniqueName('消すもの')
  await saveCode(page, name)

  // やめると消えない
  await page.getByRole('button', { name: `「${name}」を削除` }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'やめる' }).click()
  await expect(page.getByRole('rowheader', { name })).toBeVisible()

  // 帯の × も「やめる」と同じ（riml-ds brand.md §7.7）
  await page.getByRole('button', { name: `「${name}」を削除` }).click()
  await page.getByRole('dialog').getByRole('button', { name: '閉じる' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.getByRole('rowheader', { name })).toBeVisible()

  // 削除すると一覧から消える
  await page.getByRole('button', { name: `「${name}」を削除` }).click()
  await page.getByRole('button', { name: '削除する' }).click()
  await expect(page.getByRole('rowheader', { name })).toHaveCount(0, SLOW)

  // 取り消すと戻る（AAA 3.3.6）
  await page.getByRole('button', { name: '削除を取り消す' }).click()
  await expect(page.getByRole('rowheader', { name })).toBeVisible(SLOW)

  await page.reload()
  await expect(page.getByRole('rowheader', { name })).toBeVisible(SLOW)
})

test('一覧に axe の違反がない @a11y', async ({ page }) => {
  await signInAsGuest(page)
  await openCodes(page)
  await saveCode(page, uniqueName('検査'))

  // フォルダの改名・削除の操作も検査対象に入れる
  const folderName = uniqueName('検査フォルダ')
  await page.getByLabel('新しいフォルダの名前').fill(folderName)
  await page.getByRole('button', { name: 'フォルダを作る' }).click()
  await expect(page.getByLabel(`「${folderName}」の新しい名前`)).toBeVisible(SLOW)

  const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze()
  expect(results.violations).toEqual([])
})

test('フォルダ削除の確認ダイアログに axe の違反がない @a11y', async ({ page }) => {
  await signInAsGuest(page)
  await openCodes(page)

  const folderName = uniqueName('検査4')
  await page.getByLabel('新しいフォルダの名前').fill(folderName)
  await page.getByRole('button', { name: 'フォルダを作る' }).click()
  await page.getByRole('button', { name: `「${folderName}」を削除` }).click()
  await expect(page.getByRole('dialog')).toBeVisible(SLOW)

  const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze()
  expect(results.violations).toEqual([])
})

test('編集画面に axe の違反がない @a11y', async ({ page }) => {
  await signInAsGuest(page)
  await openCodes(page)
  const name = uniqueName('検査2')
  await saveCode(page, name)
  await page.getByRole('link', { name }).click()
  await expect(page.getByRole('heading', { level: 2, name: '共有リンク' })).toBeVisible(SLOW)
  // プレビューが出てから測る（生成した SVG も検査対象に入れる）
  await expect(page.locator('.qrcc-code-preview svg')).toBeVisible(SLOW)

  const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze()
  expect(results.violations).toEqual([])
})

test('削除の確認ダイアログに axe の違反がない @a11y', async ({ page }) => {
  await signInAsGuest(page)
  await openCodes(page)
  const name = uniqueName('検査3')
  await saveCode(page, name)

  await page.getByRole('button', { name: `「${name}」を削除` }).click()
  await expect(page.getByRole('dialog')).toBeVisible()

  const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze()
  expect(results.violations).toEqual([])
})

test('一覧の操作がキーボードだけで届く @a11y', async ({ page }) => {
  await signInAsGuest(page)
  await openCodes(page)
  const name = uniqueName('キーボード')
  await saveCode(page, name)

  const deleteButton = page.getByRole('button', { name: `「${name}」を削除` })
  await deleteButton.focus()
  await expect(deleteButton).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()

  // Esc で閉じられる（<dialog> がやってくれる）
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('一覧の操作が 44x44 CSS px 以上ある @a11y', async ({ page }) => {
  await signInAsGuest(page)
  await openCodes(page)
  const name = uniqueName('対象サイズ')
  await saveCode(page, name)

  const targets = await page.locator('.qrcc-code-table__sort, .qrcc-code-table__delete').all()
  expect(targets.length).toBeGreaterThan(0)
  const measured = await Promise.all(
    targets.map(async (target) => ({
      label: await target.textContent(),
      box: await target.boundingBox(),
    })),
  )
  for (const { label, box } of measured) {
    expect(box?.height ?? 0, `target: ${label}`).toBeGreaterThanOrEqual(44)
    expect(box?.width ?? 0, `target: ${label}`).toBeGreaterThanOrEqual(44)
  }
})

/**
 * 操作ボタンのラベルにはフォルダ名が入るので、名前が長いほど操作列が広くなる。
 * 幅の配分を操作列任せにすると入力欄が数十 px まで潰れ、改名できなくなる。
 */
test('フォルダ名が長くても、改名の入力欄が潰れない @a11y', async ({ page }) => {
  await signInAsGuest(page)
  await openCodes(page)

  const folderName = uniqueName('とても長い名前のフォルダで幅を奪う')
  await page.getByLabel('新しいフォルダの名前').fill(folderName)
  await page.getByRole('button', { name: 'フォルダを作る' }).click()

  const input = page.getByLabel(`「${folderName}」の新しい名前`)
  await expect(input).toBeVisible(SLOW)
  const box = await input.boundingBox()
  // 目安は 14rem（= 224px）。下回るなら操作列に幅を取られている。
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(224)
})

test('320px 幅でも横スクロールが出ない @a11y', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await signInAsGuest(page)
  await openCodes(page)
  await saveCode(page, uniqueName('狭い画面'))

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflows).toBe(false)
})
