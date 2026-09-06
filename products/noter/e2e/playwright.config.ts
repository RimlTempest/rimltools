import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

/**
 * worktree ごとに違うポートを使う。
 *
 * 既定の 4173 を共有すると、`reuseExistingServer` が**別の worktree が起動した
 * サーバ**を掴んでしまい、別ブランチのビルドに対してテストが走る。
 * 実際にそれで無関係な失敗が大量に出たので、チェックアウトの場所から
 * 決まる値にしている（同じ worktree 内では再利用が効く）。
 */
const portFromCheckout = () => {
  const root = fileURLToPath(new URL('..', import.meta.url))
  let hash = 0
  for (const character of root) hash = (hash * 31 + (character.codePointAt(0) ?? 0)) % 1000
  return 4200 + hash
}

const PORT = Number(process.env['NOTER_E2E_PORT'] ?? portFromCheckout())
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
    // apps/web/dist は git 管理外なので、必ずここでビルドする。
    //
    // ローカル D1 のマイグレーションもここで当てる。認証はこれが無いと 500 になり、
    // 「CI では落ちるが手元では通る」という一番たちの悪い差が生まれる。
    command: [
      'bun run --cwd ../ build',
      'bun run --filter @noter/web db:local',
      `bun run --filter @noter/web preview -- --port ${PORT} --strictPort`,
    ].join(' && '),
    // plan 002: 認証はまだ無いので、e2e の間だけ /ws の認可を開ける。
    // plan 004 が本物の認可に差し替えたら消す（apps/web/src/server/ws-authorize.ts）。
    env: { NOTER_DEV_OPEN_WS: '1' },
    stdout: 'pipe',
    stderr: 'pipe',
    url: baseURL,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
})
