import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
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
  // TanStack Start が server function を切り出したモジュールは、
  // Cloudflare プラグインが外部化する環境の外でも解析される。
  // `cloudflare:*` は Workers ランタイムが供給するので、常に外部扱いにする。
  build: { rollupOptions: { external: [/^cloudflare:/] } },
  plugins: [
    // cloudflare() は tanstackStart() より前に置く（Cloudflare 公式手順）。
    // auxiliaryWorkers に noter-sync を含めることで、DocumentRoom(DO) を
    // 同一デプロイ単位で持てる。noter-sync 自体は routes を持たないので、
    // DO へ到達できるのは noter-web の認可済みコードだけ（ADR-0002）。
    cloudflare({
      viteEnvironment: { name: 'ssr' },
      auxiliaryWorkers: [{ configPath: '../sync/wrangler.jsonc' }],
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
})
