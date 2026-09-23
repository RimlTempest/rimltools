import type { Result } from './tools.ts'

/**
 * Cloudflare API のクライアント（REST と GraphQL Analytics）。リリース（scripts/release）と
 * 運用（scripts/ops）の両方がこれだけを使う。
 *
 * - fetch は引数で受け取る（テストで差し替えられるように）
 * - 通信の失敗・JSON でない応答も含め、例外を投げずに Result で返す
 * - エラー文字列はログや job summary に出るので、API トークンを入れない（URL と応答だけ）
 */
export type Fetch = (input: string, init: RequestInit) => Promise<Response>

export type Cloudflare = {
  /** REST。2xx 以外はエラー */
  rest: (method: string, path: string, body?: unknown) => Promise<Result<unknown, string>>
  /** GraphQL Analytics。2xx 以外はエラー */
  graphql: (query: string, variables: Record<string, unknown>) => Promise<Result<unknown, string>>
  /**
   * GraphQL Analytics。HTTP のステータスに関わらず、JSON の本文をそのまま返す。
   * GraphQL のエラー（`errors`）を呼び出し側で解釈したいとき用（例: スキーマに無い
   * フィールドを検知して、確認済みのフィールドで取り直す scripts/ops/push-metrics.ts）。
   */
  graphqlBody: (
    query: string,
    variables: Record<string, unknown>,
  ) => Promise<Result<unknown, string>>
}

const API = 'https://api.cloudflare.com/client/v4'

type Reply = { status: number; ok: boolean; text: string; json: Result<unknown, undefined> }

const parseJson = (text: string): Result<unknown, undefined> => {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false, error: undefined }
  }
}

export const createCloudflare = (opts: { apiToken: string; fetch: Fetch }): Cloudflare => {
  const send = async (
    method: string,
    url: string,
    body?: unknown,
  ): Promise<Result<Reply, string>> => {
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
    return { ok: true, value: { status: res.status, ok: res.ok, text, json: parseJson(text) } }
  }

  // 2xx の JSON だけを値にする（rest / graphql）
  const strict = async (
    method: string,
    url: string,
    body?: unknown,
  ): Promise<Result<unknown, string>> => {
    const reply = await send(method, url, body)
    if (!reply.ok) return reply
    const { status, ok, text, json } = reply.value
    if (!json.ok) return { ok: false, error: `${method} ${url}: ${status} ${text.slice(0, 200)}` }
    if (!ok) return { ok: false, error: `${method} ${url}: ${status} ${text.slice(0, 500)}` }
    return { ok: true, value: json.value }
  }

  const graphqlUrl = `${API}/graphql`

  return {
    rest: (method, path, body) => strict(method, `${API}${path}`, body),
    graphql: (query, variables) => strict('POST', graphqlUrl, { query, variables }),
    graphqlBody: async (query, variables) => {
      const reply = await send('POST', graphqlUrl, { query, variables })
      if (!reply.ok) return reply
      const { status, text, json } = reply.value
      if (!json.ok) {
        return { ok: false, error: `POST ${graphqlUrl}: ${status} ${text.slice(0, 200)}` }
      }
      return { ok: true, value: json.value }
    },
  }
}
