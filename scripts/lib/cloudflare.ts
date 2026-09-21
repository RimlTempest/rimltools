import type { Result } from './tools.ts'

/**
 * Cloudflare API の薄いクライアント（REST と GraphQL Analytics）。
 * fetch は引数で受け取る（テストで差し替えられるように）。
 */
export type Fetch = (input: string, init: RequestInit) => Promise<Response>

export type Cloudflare = {
  rest: (method: string, path: string, body?: unknown) => Promise<Result<unknown, string>>
  graphql: (query: string, variables: Record<string, unknown>) => Promise<Result<unknown, string>>
}

const api = 'https://api.cloudflare.com/client/v4'

export const createCloudflare = (opts: { apiToken: string; fetch: Fetch }): Cloudflare => {
  const call = async (
    method: string,
    url: string,
    body?: unknown,
  ): Promise<Result<unknown, string>> => {
    let res: Response
    try {
      res = await opts.fetch(url, {
        method,
        headers: {
          authorization: `Bearer ${opts.apiToken}`,
          'content-type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
    } catch (error) {
      return { ok: false, error: `${method} ${url}: ${String(error)}` }
    }
    const text = await res.text()
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      return { ok: false, error: `${method} ${url}: ${res.status} ${text.slice(0, 200)}` }
    }
    if (!res.ok)
      return { ok: false, error: `${method} ${url}: ${res.status} ${text.slice(0, 500)}` }
    return { ok: true, value: json }
  }
  return {
    rest: (method, path, body) => call(method, `${api}${path}`, body),
    graphql: (query, variables) => call('POST', `${api}/graphql`, { query, variables }),
  }
}
