import { AxeBuilder } from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

/**
 * `.claude/skills/noter-html-a11y/references/manual-checks.md` のうち、
 * **機械で確かめられるもの**をここに落とす（plan 008 Step 3）。
 *
 * 読み上げ（VoiceOver / NVDA）だけは人が行う。ここに無いからといって
 * 確認しなくてよいわけではない。
 */

const WCAG_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag2aaa',
  'wcag21a',
  'wcag21aa',
  'wcag22aa',
  'best-practice',
] as const

/**
 * `transition-duration` / `animation-duration` の計算値（`0.01ms` のような
 * 単位つきの並び）を秒に直し、いちばん長いものを返す。
 */
const seconds = (value: string): number =>
  value
    .split(',')
    .map((part) => {
      const trimmed = part.trim()
      const amount = Number.parseFloat(trimmed)
      if (Number.isNaN(amount)) return 0
      return trimmed.endsWith('ms') ? amount / 1000 : amount
    })
    .reduce((longest, amount) => Math.max(longest, amount), 0)

/** マウスを使わずに、いま焦点のある要素の文字を読む。 */
const focusedText = (page: Page): Promise<string> =>
  page.evaluate(() => document.activeElement?.textContent?.trim() ?? '')

/**
 * Tab だけで目当ての操作まで進む。届かなければ落とす
 * （= キーボードで到達できない機能があるということ）。
 */
const tabUntil = async (
  page: Page,
  check: () => Promise<boolean>,
  remaining = 40,
): Promise<void> => {
  if (remaining === 0) throw new Error('Tab だけでは到達できなかった')
  await page.keyboard.press('Tab')
  if (await check()) return
  return tabUntil(page, check, remaining - 1)
}

const tabToLabel = (page: Page, label: string): Promise<void> =>
  tabUntil(page, async () => (await focusedText(page)) === label)

const tabToEditor = (page: Page): Promise<void> =>
  tabUntil(page, () =>
    page.evaluate(() => document.activeElement?.classList.contains('cm-content') ?? false),
  )

/** キーボードだけで文書を 1 本作り、エディタが載るまで待つ。 */
const createByKeyboard = async (page: Page): Promise<void> => {
  await page.goto('/')
  await tabToLabel(page, 'Markdown で始める')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/d\/doc_[0-9a-z]{24}$/)
  await expect(page.locator('.cm-content')).toBeVisible()
  // ハイドレーションが終わるまでは Enter で開かない操作がある
  await expect(page.getByText(/同期済み|同期中/)).toBeVisible({ timeout: 20_000 })
}

/**
 * manual-checks.md §1。作る → 書く → 抜ける、までマウスに触らない。
 * エディタから抜けられること（AAA 2.1.2）が肝。
 */
test('キーボードだけで文書を作って書き、エディタから抜けられる @a11y', async ({ page }) => {
  await createByKeyboard(page)

  await tabToEditor(page)
  await page.keyboard.type('キーボードだけで書ける')
  await expect(page.locator('.cm-content')).toContainText('キーボードだけで書ける')

  // Esc → Tab で抜ける（ux.md §7 / 画面のヒント文と同じ手順）
  await page.keyboard.press('Escape')
  await page.keyboard.press('Tab')
  await expect(page.locator('.cm-content')).not.toBeFocused()
})

/**
 * manual-checks.md §1。ダイアログは Esc で閉じ、フォーカスが**開いた
 * ボタンに戻る**（`<dialog>` の showModal に任せている）。
 */
test('キーボードだけで共有ダイアログを開閉でき、フォーカスが戻る @a11y', async ({ page }) => {
  await createByKeyboard(page)

  await tabToLabel(page, '共有')
  await expect(async () => {
    await page.keyboard.press('Enter')
    await expect(page.getByRole('radio', { name: '閲覧のみ' })).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 20_000 })

  await page.keyboard.press('Escape')
  await expect(page.getByRole('radio', { name: '閲覧のみ' })).toBeHidden()
  await expect(page.getByRole('button', { name: '共有' })).toBeFocused()
})

/**
 * manual-checks.md §2。文字を 200% にして幅を半分にする（= 200% 拡大相当）。
 * 横スクロールが出ず、操作が画面から切れないこと（1.4.4 / 1.4.10）。
 */
test('200% 相当に拡大しても横スクロールが出ず、操作が残る @a11y', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 720 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Markdown で始める' }).click()
  await expect(page.locator('.cm-content')).toBeVisible()
  // rem で組んであれば、根の文字サイズを倍にするだけで全体が拡大する
  await page.addStyleTag({ content: ':root { font-size: 200% }' })

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflows).toBe(false)

  const names = ['共有', '端末に保存', 'エディタのみ'] as const
  const measured = await Promise.all(
    names.map(async (name) => ({
      name,
      box: await page.getByRole('button', { name, exact: true }).boundingBox(),
    })),
  )
  for (const { name, box } of measured) {
    expect(box?.width ?? 0, `${name} が見えない`).toBeGreaterThan(0)
    expect(box?.x ?? -1, `${name} が画面の左に切れている`).toBeGreaterThanOrEqual(0)
    expect((box?.x ?? 0) + (box?.width ?? 0), `${name} が画面の右に切れている`).toBeLessThanOrEqual(
      640,
    )
  }
})

/**
 * manual-checks.md §5。OS の「視差を減らす」で動きが止まる（AAA 2.3.3）。
 * 0.01ms は `prefers-reduced-motion` の定石（0 にすると
 * `transitionend` を待つコードが止まる）なので、それも「止まっている」とみなす。
 */
test('動きを減らす設定でアニメーションが止まる @a11y', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Markdown で始める' }).click()
  await expect(page.locator('.cm-content')).toBeVisible()

  const durations = await page.evaluate(() =>
    [...document.querySelectorAll('*')].map((element) => {
      const style = getComputedStyle(element)
      return {
        name: `${element.tagName}.${element.className}`,
        transition: style.transitionDuration,
        animation: style.animationDuration,
      }
    }),
  )

  const moving = durations
    .filter((element) => seconds(element.transition) > 0.001 || seconds(element.animation) > 0.001)
    .map((element) => element.name)
  expect(moving).toEqual([])
})

/**
 * manual-checks.md §4。Windows のハイコントラスト（`forced-colors: active`）で
 * 情報が消えないこと。境界線を `CanvasText` に戻す指定が効いているかを axe で見る。
 */
test('ハイコントラストのエディタに axe の違反がない @a11y', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')
  await page.getByRole('button', { name: 'JSON で始める' }).click()
  await expect(page.locator('.cm-content')).toBeVisible()
  await page.locator('.cm-content').click()
  await page.keyboard.type('{"name":"設計",')
  await page.getByRole('button', { name: '問題 1 件' }).click()
  await expect(page.getByRole('region', { name: '問題' })).toBeVisible()

  const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze()
  expect(results.violations).toEqual([])
})
