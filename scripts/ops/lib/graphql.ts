/**
 * Cloudflare GraphQL Analytics API の最小クライアント。
 * NOTE: C レーン（リリース）の scripts/lib/cloudflare.ts と統合する予定（scripts/ops/README.md）。
 */

import type { Result } from '../../lib/tools.ts'
import type { FetchLike } from './github.ts'

export const CF_GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql'

export const cfGraphql = async (
  deps: { fetch: FetchLike; token: string },
  query: string,
  variables: Record<string, string>,
): Promise<Result<unknown, string>> => {
  const res = await deps.fetch(CF_GRAPHQL_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${deps.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const text = await res.text()
  if (!res.ok)
    return { ok: false, error: `Cloudflare GraphQL: ${res.status} ${text.slice(0, 200)}` }
  return { ok: true, value: JSON.parse(text) }
}
