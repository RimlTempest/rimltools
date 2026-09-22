/**
 * Google ログインをローカルで試すための起動計画（`bun run dev:<tool>:oauth`）。
 *
 * Google は `*.localhost` のリダイレクト URI を受け付けず、`http://localhost:<port>` だけを
 * 許す（Public Suffix List に無い TLD は不可）。そこでこのときだけ portless を外し
 * （`PORTLESS=0`。`PORTLESS_URL` が渡らないので `DEV_PUBLIC_ORIGIN` も入らない）、
 * tools.json の `localOAuthPort` で待ち受ける（docs/local-dev.md）。
 */

import type { Result } from './tools.ts'

export type OAuthDevTool = { name: string; path: string; localOAuthPort: number | null }

export type OAuthDevPlan = {
  cwd: string
  env: { PORTLESS: '0'; PORT: string; HOST: 'localhost' }
  url: string
  redirectUri: string
}

export const planOAuthDev = (tool: OAuthDevTool): Result<OAuthDevPlan, string> => {
  if (tool.localOAuthPort === null) {
    return { ok: false, error: `${tool.name} has no localOAuthPort in tools.json` }
  }
  const url = `http://localhost:${tool.localOAuthPort}`
  return {
    ok: true,
    value: {
      cwd: tool.path,
      env: { PORTLESS: '0', PORT: String(tool.localOAuthPort), HOST: 'localhost' },
      url,
      redirectUri: `${url}/api/auth/callback/google`,
    },
  }
}
