import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

/**
 * WebMCP（`document.modelContext`）は 2026-09 時点で Origin Trial 段階
 * （Chrome 149 / Edge 150）で、CI が使うデスクトップ Chromium には元々存在しない。
 * `page.addInitScript` で偽物を注入し、ページのスクリプトより先に走らせることで
 * 「API がある環境」を作る（`e2e/tests/nfc.spec.ts` と同じやり方）。
 *
 * 登録されたツールは `window.__webmcpRegistered` に貯めておき、テストから
 * 直接 `execute` を呼べるようにする。
 */
const installFakeModelContext = (page: Page) =>
  page.addInitScript(() => {
    type FakeTool = {
      readonly name: string
      readonly execute: (input: Record<string, unknown>) => Promise<{
        readonly content: readonly { readonly type: string; readonly text: string }[]
      }>
    }
    const registered: FakeTool[] = []
    Reflect.set(window, '__webmcpRegistered', registered)
    Reflect.set(document, 'modelContext', {
      registerTool: (tool: FakeTool) => {
        registered.push(tool)
        return Promise.resolve(undefined)
      },
    })
  })

const registeredToolNames = (page: Page) =>
  page.evaluate(() => {
    const registered = Reflect.get(window, '__webmcpRegistered')
    return Array.isArray(registered)
      ? registered.map((tool: { name: string }) => tool.name).toSorted()
      : []
  })

test('modelContext が無い既定の環境では、コンソールにエラーを出さず従来どおり表示される @a11y', async ({
  page,
}) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))

  await page.goto('/')
  await expect(
    page.getByRole('region', { name: 'コードを作る' }).locator('.qrcc-code-preview'),
  ).toBeVisible({ timeout: 15_000 })

  expect(consoleErrors).toEqual([])
})

test('偽の modelContext を注入すると generate-code と decode-code-image が登録される', async ({
  page,
}) => {
  await installFakeModelContext(page)
  await page.goto('/')

  await page.waitForFunction(() => {
    const registered = Reflect.get(window, '__webmcpRegistered')
    return Array.isArray(registered) && registered.length === 2
  })

  expect(await registeredToolNames(page)).toEqual(['decode-code-image', 'generate-code'])
})

test('注入した modelContext 経由で generate-code を実行できる', async ({ page }) => {
  await installFakeModelContext(page)
  await page.goto('/')

  await page.waitForFunction(() => {
    const registered = Reflect.get(window, '__webmcpRegistered')
    return Array.isArray(registered) && registered.length === 2
  })

  const text = await page.evaluate(async () => {
    // 標準の型定義に無いグローバルなので Reflect で取り出し、型は
    // アサーションではなく変数の型注釈で与える（`as` は使わない）。
    const registered: readonly {
      readonly name: string
      readonly execute: (
        input: Record<string, unknown>,
      ) => Promise<{ readonly content: readonly { readonly text: string }[] }>
    }[] = Reflect.get(window, '__webmcpRegistered')
    const generateTool = registered.find((tool) => tool.name === 'generate-code')
    const result = await generateTool?.execute({ text: 'https://example.com' })
    return result?.content[0]?.text
  })

  expect(text).toContain('URL: https://example.com')
})

test('注入した modelContext 経由で generate-code を kind: vcard で実行できる', async ({ page }) => {
  await installFakeModelContext(page)
  await page.goto('/')

  await page.waitForFunction(() => {
    const registered = Reflect.get(window, '__webmcpRegistered')
    return Array.isArray(registered) && registered.length === 2
  })

  const text = await page.evaluate(async () => {
    // 標準の型定義に無いグローバルなので Reflect で取り出し、型は
    // アサーションではなく変数の型注釈で与える（`as` は使わない）。
    const registered: readonly {
      readonly name: string
      readonly execute: (
        input: Record<string, unknown>,
      ) => Promise<{ readonly content: readonly { readonly text: string }[] }>
    }[] = Reflect.get(window, '__webmcpRegistered')
    const generateTool = registered.find((tool) => tool.name === 'generate-code')
    const result = await generateTool?.execute({
      kind: 'vcard',
      vcard: { name: '山田太郎', organization: '', tel: '', email: '', url: '' },
    })
    return result?.content[0]?.text
  })

  expect(text).toContain('名刺: 山田太郎')
})

/**
 * デコード用 wasm（rxing を含み、生成用の何倍もある）は、読み取りツールを
 * 実際に呼ぶまで取りに行ってはいけない（docs/free-tier-budget.md）。
 * ツールを登録しただけの直後の resource entries に含まれないことで確かめる。
 */
test('wasm を先読みしていない（decode-code-image を呼ぶまで取りに行かない）', async ({ page }) => {
  await installFakeModelContext(page)
  await page.goto('/')

  await page.waitForFunction(() => {
    const registered = Reflect.get(window, '__webmcpRegistered')
    return Array.isArray(registered) && registered.length === 2
  })

  const hasScanWasmEntry = await page.evaluate(() =>
    performance.getEntriesByType('resource').some((entry) => entry.name.includes('qrcc_scan_wasm')),
  )

  expect(hasScanWasmEntry).toBe(false)
})
