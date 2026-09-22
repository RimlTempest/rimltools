import { createFileRoute } from '@tanstack/react-router'
// `cloudflare:workers` は Workers ランタイムの組み込みモジュール（generate.route.tsx と同じ扱い）
import { env } from 'cloudflare:workers'
import { drizzle } from 'drizzle-orm/d1'
import { makeAuthFromEnv } from '../server/from-env.ts'
import { makeD1SqlRunner } from '../server/sql.ts'

/**
 * Better Auth の HTTP エンドポイント（`/api/auth/*`）。
 *
 * Google の認可コードが返ってくる `/api/auth/callback/google` を含むので、
 * ここが無いと Google ログインは成立しない（docs/deployment.md）。
 *
 * D1 バインディングを Drizzle に渡す配線は、`D1Database` のグローバル型が
 * 見える services/web 側のプログラム（= このルートファイル）で行う。
 */
export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      ANY: ({ request }) =>
        makeAuthFromEnv(env, {
          makeDb: () => drizzle(env.DB),
          sql: makeD1SqlRunner(env.DB),
          origin: new URL(request.url).origin,
        }).handler(request),
    },
  },
})
