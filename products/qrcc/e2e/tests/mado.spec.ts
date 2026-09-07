import { expect, test } from '@playwright/test'

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
