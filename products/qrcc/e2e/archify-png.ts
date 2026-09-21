/**
 * archify のビューア HTML から、README 用の構成図 PNG（light / dark）を書き出す。
 *
 * ビューアは `prefers-color-scheme` で初期テーマを決めるので、Playwright の
 * `colorScheme` を切り替えて `<svg>` 要素だけを 2 倍解像度で撮る。
 * 入口は `scripts/archify.sh`。単体で使うなら:
 *
 *   bun e2e/archify-png.ts docs/architecture/qrcc2-architecture.html docs/architecture/qrcc2-architecture
 */
import { type Browser, chromium } from '@playwright/test'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const THEMES = ['light', 'dark'] as const

function readArgs(): { htmlPath: string; outBase: string } {
  const [htmlPath, outBase] = process.argv.slice(2)
  if (htmlPath === undefined || outBase === undefined) {
    console.error('usage: bun e2e/archify-png.ts <viewer.html> <out-base>')
    process.exit(2)
  }
  return { htmlPath, outBase }
}

const { htmlPath, outBase } = readArgs()

async function capture(browser: Browser, theme: (typeof THEMES)[number]): Promise<void> {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 2,
    colorScheme: theme,
    reducedMotion: 'reduce',
  })
  await page.goto(pathToFileURL(resolve(htmlPath)).href)
  const svg = page.locator('svg').first()
  await svg.waitFor()
  // Web フォントの読み込みを待たないと、フォールバック書体で撮れてしまう
  await page.evaluate('document.fonts.ready')
  await svg.screenshot({ path: `${outBase}.${theme}.png` })
  await page.close()
}

const browser = await chromium.launch()
try {
  await Promise.all(THEMES.map((theme) => capture(browser, theme)))
} finally {
  await browser.close()
}
