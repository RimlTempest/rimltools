import { defineConfig, devices } from '@playwright/test'

import { allocateFreePort, resolveE2ePort } from '../../../scripts/lib/e2e-port.ts'

/**
 * プレビューサーバのポートは実行ごとに OS から空きを 1 つもらう（scripts/lib/e2e-port.ts）。
 *
 * 既定の 4173 や、チェックアウトの場所から決まる番号を使うと、`reuseExistingServer` が
 * 別の worktree・別プロダクトのサーバを掴んだり、テストの途中でそのサーバが消えたりした。
 * 決めた番号は NOTER_E2E_PORT に書き残すので、Playwright の worker も同じ番号を使う。
 * 起動済みのサーバを使い回したいときは NOTER_E2E_PORT を明示する。
 */
const PORT = resolveE2ePort(process.env, 'NOTER_E2E_PORT', allocateFreePort)
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 2 : 0,
  /*
   * CI のランナーは 4 コアで、Playwright の既定（コア数の半分）は 2 になる。
   * 待ち時間の大半はページ遷移で CPU は空いているので、コア数ぶんまで上げる。
   * 手元は既定（コア数の半分）に任せる。
   *
   * **これ以上増やさないこと。** 並列度を上げるとページの描画が遅れ、
   * 寸法を測る種類のテスト（対象サイズ・横スクロール）が実際に落ちた。
   */
  workers: process.env['CI'] ? 4 : undefined,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium-light', use: { ...devices['Desktop Chrome'], colorScheme: 'light' } },
    { name: 'chromium-dark', use: { ...devices['Desktop Chrome'], colorScheme: 'dark' } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    {
      name: 'reduced-motion',
      use: { ...devices['Desktop Chrome'], reducedMotion: 'reduce' },
    },
  ],
  webServer: {
    // services/web/dist は git 管理外なので、必ずここでビルドする。
    //
    // ローカル D1 のマイグレーションもここで当てる。認証はこれが無いと 500 になり、
    // 「CI では落ちるが手元では通る」という一番たちの悪い差が生まれる。
    command: [
      'bun run --cwd ../ build',
      'bun run --filter @noter/web db:local',
      `bun run --filter @noter/web preview -- --port ${PORT} --strictPort`,
    ].join(' && '),
    stdout: 'pipe',
    stderr: 'pipe',
    url: baseURL,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
})
