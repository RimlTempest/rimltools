import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { devServerOptions, devWorkerVars } from '@rimltools/devtools'
import { defineConfig } from 'vite'

// tsr.config.json を唯一の定義元にし、Vite プラグインと `tsr generate` CLI で
// ルート探索の設定がずれないようにする。
//
// パスの解決基準がキーごとに違う:
//   routesDirectory   … プラグインは srcDirectory 基準、CLI はプロジェクトルート基準
//                       → 絶対パスに解決して渡し、ずれをなくす
//   virtualRouteConfig … どちらもプロジェクトルート基準 → そのまま渡す
const tsrConfig: { routesDirectory: string; virtualRouteConfig: string } = JSON.parse(
  readFileSync(new URL('./tsr.config.json', import.meta.url), 'utf8'),
)
const fromHere = (relative: string) => fileURLToPath(new URL(relative, import.meta.url))

// portless（docs/local-dev.md）が渡す PORT / HOST で待ち受け、ブラウザから見える https の
// オリジン（PORTLESS_URL）を Worker に DEV_PUBLIC_ORIGIN として伝える。portless を使わない
// 起動（PORT 無し）では Vite の既定のまま。DEV_PUBLIC_ORIGIN は dev サーバのときだけ足す。
export default defineConfig(({ command }) => {
  const server = devServerOptions(process.env)
  if (!server.ok) throw new Error(server.error)
  const devVars = devWorkerVars(process.env, command)
  return {
    server: server.value,
    // TanStack Start が server function を切り出したモジュールは、
    // Cloudflare プラグインが外部化する環境の外でも解析される。
    // `cloudflare:*` は Workers ランタイムが供給するので、常に外部扱いにする。
    // QRCC_BUNDLE_ANALYZE=1 のときだけ sourcemap を出す（docs/bundle.md の集計用。本番には出さない）。
    build: {
      rollupOptions: { external: [/^cloudflare:/] },
      sourcemap: process.env['QRCC_BUNDLE_ANALYZE'] === '1',
    },
    plugins: [
      // cloudflare() は tanstackStart() より前に置く（Cloudflare 公式手順）。
      // auxiliaryWorkers に Rust の qrcc-api を含めることで、同一デプロイ単位・
      // 追加リクエスト課金なしの service binding が成立する（ADR-0002）。
      cloudflare({
        viteEnvironment: { name: 'ssr' },
        auxiliaryWorkers: [{ configPath: '../api/wrangler.jsonc' }],
        ...(Object.keys(devVars).length === 0
          ? {}
          : { config: (worker) => ({ vars: { ...worker.vars, ...devVars } }) }),
      }),
      // RSC は当面無効（ADR-0008）。有効にすると server function を切り出した
      // チャンクが "No such module rsc/assets/..." で 500 になる。
      // 実際に RSC が必要になったタイミングで再検証する。
      tanstackStart({
        // ルートは feature の中に置く（co-location）。routesDirectory をリポジトリ
        // ルートの features/ に向け、URL 構成だけを src/routes.ts に集約する。
        router: {
          routesDirectory: fromHere(tsrConfig.routesDirectory),
          virtualRouteConfig: tsrConfig.virtualRouteConfig,
        },
      }),
      viteReact(),
    ],
  }
})
