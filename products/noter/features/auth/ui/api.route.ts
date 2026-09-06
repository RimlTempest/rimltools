import { createFileRoute } from '@tanstack/react-router'
// `cloudflare:workers` は Workers ランタイムの組み込みモジュール（vite.config.ts で external）
import { env } from 'cloudflare:workers'
import { makeContainer } from '../../../apps/web/src/server/container.ts'

/**
 * Better Auth の HTTP エンドポイント（`/api/auth/*`）。
 *
 * ゲストログイン（`POST /api/auth/sign-in/anonymous`）と、Google の認可コードが
 * 返ってくる `/api/auth/callback/google` を含むので、ここが無いとログインは
 * 成立しない（docs/deployment.md）。
 */
export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const { auth } = makeContainer(env, request)
        if (auth === undefined) {
          // D1 が繋がっていない = 設定ミス。認証だけを落とし、理由を残す
          return new Response('auth storage is not configured', { status: 503 })
        }
        return auth.handler(request)
      },
    },
  },
})
