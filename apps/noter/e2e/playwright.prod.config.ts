import { defineConfig, devices } from '@playwright/test'

/**
 * デプロイ済みのオリジンに対して実ブラウザで確かめる設定。
 *
 * 通常の e2e（`playwright.config.ts`）とは別にしてある。あちらはローカルで
 * ビルドして preview を起動するが、こちらは**既に動いているものを外から
 * 叩く**だけなので `webServer` を持たない。
 *
 * テーマや端末の掛け合わせもしない。ここで見たいのは「デプロイしたものが
 * 実際に動いているか」であって、画面の作り込みは通常の e2e が担保している。
 * 本数を絞るほど、デプロイ直後に速く答えが出る。
 */
const baseURL = process.env['NOTER_SMOKE_URL'] ?? 'https://noter.riml4i.com'

export default defineConfig({
  testDir: './smoke',
  fullyParallel: true,
  // 3 本しかない。待ち時間の大半はネットワークなので並べて叩く
  workers: 3,
  // 相手は実ネットワーク。1 度の瞬断でデプロイを止めない
  retries: 2,
  reporter: process.env['CI'] ? [['github'], ['list']] : [['list']],
  use: {
    baseURL,
    // 落ちた回だけ証跡を残す。毎回録ると遅くなるだけ
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'production', use: { ...devices['Desktop Chrome'] } }],
})
