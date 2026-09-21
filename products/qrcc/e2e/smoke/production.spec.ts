import { fileURLToPath } from 'node:url'
import { test as base, expect } from '@playwright/test'

/**
 * 本番に対する疎通確認（実ブラウザ）。
 *
 * `bun run smoke` の HTTP 版は「配信されているか」までしか見ない。
 * 配信されていても実行時に落ちればハイドレーションは成立せず、画面は
 * SSR のまま固まる。実際に一度その状態が本番に残った。ここでは
 * **JavaScript が動いた結果**だけを見る。
 *
 * **本番のデータを変えない。** サインインするとゲストの user と session が
 * D1 に増えるので、この spec では一切サインインしない。読み取り専用。
 *
 * 待ち方は状態ベースだけにする（`waitForTimeout` を使わない）。
 * 固定待ちは遅いうえに、遅い日にだけ落ちる。
 */

const FIXTURE = fileURLToPath(new URL('../fixtures/qr-url.png', import.meta.url))
const FIXTURE_TEXT = 'https://qrcc.riml4i.com/scan-fixture'

/** デコード用 wasm は 780KB gzip あり、本番の初回取得は時間がかかる。 */
const DECODE_TIMEOUT = 45_000

/**
 * CI では失敗した回のトレース/動画は artifact をダウンロードしないと見えない。
 * コンソールの error/warning、ページの未捕捉例外、4xx/5xx 応答、リクエスト失敗を
 * 集めておき、テストが失敗したときだけ添付ファイルとログの両方に出す。
 * `auto: true` にして、page を使う各テストで明示的に受け取らなくても動くようにする。
 */
const test = base.extend<{ diagnostics: string[] }>({
  diagnostics: [
    async ({ page }, use, testInfo) => {
      const lines: string[] = []

      page.on('console', (msg) => {
        const type = msg.type()
        if (type === 'error' || type === 'warning') lines.push(`${type} ${msg.text()}`)
      })
      page.on('pageerror', (err) => {
        lines.push(err.message)
      })
      page.on('response', (response) => {
        if (response.status() >= 400) lines.push(`${response.status()} ${response.url()}`)
      })
      page.on('requestfailed', (request) => {
        lines.push(`${request.failure()?.errorText} ${request.url()}`)
      })

      await use(lines)

      if (testInfo.status !== testInfo.expectedStatus) {
        const body = lines.join('\n') || '(nothing recorded)'
        await testInfo.attach('diagnostics', { body, contentType: 'text/plain' })
        console.log('[smoke-diagnostics]', body)
      }
    },
    { auto: true },
  ],
})

test('トップがハイドレーションし、生成がブラウザ内で動く', async ({ page, diagnostics }) => {
  await page.goto('/')

  const generate = page.getByRole('region', { name: 'コードを作る' })
  // 先に「在る」ことを待ってから中を見る。いきなり不在判定をしない
  await expect(generate).toBeVisible()

  // プレビューが出る = wasm を取得して実行できている（ハイドレーション済み）
  await expect(generate.locator('.qrcc-code-preview svg')).toBeVisible({ timeout: 30_000 })

  // 入力に反応する = React がイベントを握っている
  await generate.getByLabel('リンク先の URL').fill('https://example.com/smoke')
  await expect(generate.locator('.qrcc-code-preview')).toContainText('https://example.com/smoke', {
    timeout: 30_000,
  })

  // 4xx/5xx で終わった応答はフィクスチャの diagnostics に `${status} ${url}` の形で入っている
  const failed = diagnostics.filter((line) => /^\d{3} /.test(line))
  expect(failed, `失敗したリクエスト: ${failed.join(', ')}`).toEqual([])
})

test('読み取りが本番のブラウザで動く', async ({ page }) => {
  await page.goto('/')

  const scan = page.getByRole('region', { name: 'コードを読み取る' })
  await expect(scan).toBeVisible()

  await scan.getByLabel('コードが写っている画像').setInputFiles(FIXTURE)
  await expect(scan.getByRole('link', { name: FIXTURE_TEXT })).toBeVisible({
    timeout: DECODE_TIMEOUT,
  })
})

/**
 * Google の資格情報が空のまま登録されたことがある。空でも登録は成功し、
 * 画面からボタンが消えるだけなので、開くまで気づけない。
 */
test('サインイン画面に Google の選択肢が出る（本番の資格情報が空でない）', async ({ page }) => {
  await page.goto('/sign-in')
  await expect(page.getByRole('heading', { level: 1, name: 'サインイン' })).toBeVisible()
  // 押さない。押すと本番に user と session の行が増える
  await expect(page.getByRole('button', { name: 'Google で続ける' })).toBeVisible()
})

/** 認可は qrcc-web に一元化されている。qrcc-api が外から叩けてはいけない（ADR-0002）。 */
test('qrcc-api がインターネットから到達できない', async ({ request }) => {
  const response = await request.post('https://qrcc-api.riml.workers.dev/rpc/health', {
    data: {},
    failOnStatusCode: false,
  })
  expect(response.status()).not.toBe(200)
})
