import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import rsc from '@vitejs/plugin-rsc'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    // cloudflare() は tanstackStart() より前に置く（Cloudflare 公式手順）。
    // auxiliaryWorkers に Rust の qrcc-api を含めることで、同一デプロイ単位・
    // 追加リクエスト課金なしの service binding が成立する（ADR-0002）。
    cloudflare({
      viteEnvironment: { name: 'ssr' },
      auxiliaryWorkers: [{ configPath: '../api/wrangler.jsonc' }],
    }),
    tanstackStart({ rsc: { enabled: true } }),
    rsc(),
    viteReact(),
  ],
})
