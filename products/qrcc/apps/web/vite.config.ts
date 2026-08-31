import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import rsc from '@vitejs/plugin-rsc'
import viteReact from '@vitejs/plugin-react'
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

export default defineConfig({
  plugins: [
    // cloudflare() は tanstackStart() より前に置く（Cloudflare 公式手順）。
    // auxiliaryWorkers に Rust の qrcc-api を含めることで、同一デプロイ単位・
    // 追加リクエスト課金なしの service binding が成立する（ADR-0002）。
    cloudflare({
      viteEnvironment: { name: 'ssr' },
      auxiliaryWorkers: [{ configPath: '../api/wrangler.jsonc' }],
    }),
    tanstackStart({
      rsc: { enabled: true },
      // ルートは feature の中に置く（co-location）。routesDirectory をリポジトリ
      // ルートの features/ に向け、URL 構成だけを src/routes.ts に集約する。
      router: {
        routesDirectory: fromHere(tsrConfig.routesDirectory),
        virtualRouteConfig: tsrConfig.virtualRouteConfig,
      },
    }),
    rsc(),
    viteReact(),
  ],
})
