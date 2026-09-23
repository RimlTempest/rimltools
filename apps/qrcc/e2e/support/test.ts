import { test as base } from '@playwright/test'

/**
 * `<html data-hydrated="true">`（`@rimltools/shell` の HydrationMarker）を待つ。
 *
 * サーバが描いた HTML は、React がつながる前から操作できてしまう。並列実行で CPU が
 * 混むと、ハイドレーションが load イベントより後にずれ込み、その間の操作（ファイル選択・
 * セレクトの変更・Tab 移動）が React に届かず失われた。タイムアウトを延ばすのではなく、
 * 「つながってから操作する」ようにする。
 */
const HYDRATED = 'html[data-hydrated="true"]'

export const test = base.extend({
  page: async ({ page }, use) => {
    const goto = page.goto.bind(page)
    const reload = page.reload.bind(page)
    page.goto = async (url, options) => {
      const response = await goto(url, options)
      await page.locator(HYDRATED).waitFor({ state: 'attached' })
      return response
    }
    page.reload = async (options) => {
      const response = await reload(options)
      await page.locator(HYDRATED).waitFor({ state: 'attached' })
      return response
    }
    await use(page)
  },
})

export { expect } from '@playwright/test'
