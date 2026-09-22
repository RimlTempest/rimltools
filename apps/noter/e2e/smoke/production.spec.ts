import { expect, test } from '@playwright/test'

/**
 * 本番に対する疎通確認（実ブラウザ）。
 *
 * `bun run smoke` の HTTP 版は「配信されているか」までしか見ない。
 * 配信されていても実行時に落ちればハイドレーションは成立せず、画面は
 * SSR のまま固まる。ここでは **JavaScript が動いた結果**だけを見る。
 *
 * **本番のデータを変えない。** サインインしない。文書も作らない。
 * 「Markdown で始める」は素の `<form method="post" action="/new">` なので、
 * 押すと本番に文書の行が増える。**押さずに**「押せる状態か」だけを見る。
 *
 * 待ち方は状態ベースだけにする（`waitForTimeout` を使わない）。
 * 固定待ちは遅いうえに、遅い日にだけ落ちる。
 */

/**
 * React がこの要素をハイドレートしたか。
 *
 * noter のトップは JavaScript が無くても文書を作れる（素の form）ので、
 * 「ボタンが在る」ことはハイドレーションの証拠にならない。React が DOM に
 * 付ける内部プロパティの有無で、実際にクライアント JS が走ったかを見る。
 */
const isHydrated = (node: object): boolean =>
  Object.keys(node).some((key) => key.startsWith('__reactFiber$'))

test('トップがハイドレーションし、種別のボタンが押せる状態になる', async ({ page }) => {
  const failed: string[] = []
  page.on('response', (response) => {
    if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`)
  })

  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1, name: '文書一覧' })).toBeVisible()

  // 押さない。押すと本番に文書が 1 つ増える
  const create = page.getByRole('button', { name: 'Markdown で始める' })
  await expect(create).toBeVisible()
  await expect(create).toBeEnabled()
  await expect.poll(async () => await create.evaluate(isHydrated)).toBe(true)

  expect(failed, `失敗したリクエスト: ${failed.join(', ')}`).toEqual([])
})

/**
 * ログイン画面はゲストと Google の 2 経路（ADR-0010）。ゲストの導線が
 * 消えると「開いた瞬間に書ける」が成立しなくなる。
 *
 * Google のボタンは資格情報が登録されていないと出ない。本番にしか
 * 資格情報が無く、手元で同じ判定ができないので、ここでは見ない
 * （`docs/deployment.md` の手動確認に任せる）。
 */
test('ログイン画面にゲストの導線が出る', async ({ page }) => {
  await page.goto('/sign-in')

  await expect(page.getByRole('heading', { level: 1, name: 'ログイン' })).toBeVisible()
  // 押さない。押すと本番に user と session の行が増える
  await expect(page.getByRole('button', { name: 'ゲストのまま続ける' })).toBeVisible()
})

/**
 * `/ws/:documentId` はルータより手前で `src/server.ts` が横取りする
 * （ADR-0002）。デプロイでこの配線が外れると、同時編集だけが静かに死ぬ。
 * Upgrade を付けなければ 426 が返る（`apps/web/src/server/ws-gate.ts`）。
 *
 * 文書 ID は実在しなくてよい。Upgrade の判定が先に来るので、認可も
 * 検索も走らず、本番のデータには一切触れない。
 *
 * `page.request.get` ではなく実ブラウザの遷移で叩く。GitHub Actions の
 * runner から `page.request` で叩くと Cloudflare の bot 対策に 403 で弾かれた
 * （同じ runner の `bun run smoke`（Bun fetch）と、実ブラウザの遷移は通る）。
 */
test('WebSocket の入口がルータより手前で応えている', async ({ page }) => {
  const response = await page.goto('/ws/doc_000000000000000000000000')
  expect(response?.status()).toBe(426)
})
