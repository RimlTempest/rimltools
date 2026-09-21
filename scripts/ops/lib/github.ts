/** Issue 操作に要る分だけの GitHub REST クライアント（GITHUB_TOKEN で動く範囲）。 */

import type { Result } from '../../lib/tools.ts'
import { at, numberAt, stringAt } from './json.ts'

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export type GithubDeps = { fetch: FetchLike; token: string; repository: string; apiUrl: string }

export type Github = ReturnType<typeof githubClient>

const ignore = async (p: Promise<Result<unknown, string>>): Promise<Result<null, string>> => {
  const r = await p
  return r.ok ? { ok: true, value: null } : r
}

export const githubClient = (deps: GithubDeps) => {
  const base = `${deps.apiUrl}/repos/${deps.repository}`

  const call = async (
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Result<unknown, string>> => {
    const init: RequestInit = {
      method,
      headers: {
        authorization: `Bearer ${deps.token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'content-type': 'application/json',
      },
    }
    if (body !== undefined) init.body = JSON.stringify(body)
    const res = await deps.fetch(`${base}${path}`, init)
    const text = await res.text()
    if (!res.ok)
      return { ok: false, error: `GitHub ${method} ${path}: ${res.status} ${text.slice(0, 200)}` }
    return { ok: true, value: text.length > 0 ? JSON.parse(text) : null }
  }

  return {
    /** label 付きの open な Issue のうち、本文に marker を含む最初の番号 */
    findOpenIssue: async (
      label: string,
      marker: string,
    ): Promise<Result<number | null, string>> => {
      const r = await call(
        'GET',
        `/issues?state=open&labels=${encodeURIComponent(label)}&per_page=100`,
      )
      if (!r.ok) return r
      const list = Array.isArray(r.value) ? r.value : []
      const hit = list.find(
        (i) => at(i, 'pull_request') === undefined && (stringAt(i, 'body') ?? '').includes(marker),
      )
      return { ok: true, value: hit === undefined ? null : (numberAt(hit, 'number') ?? null) }
    },

    /** label 付きの open な Issue が 1 つでもあるか（release-freeze の判定と同じ契約） */
    hasOpenIssue: async (label: string): Promise<Result<number | null, string>> => {
      const r = await call(
        'GET',
        `/issues?state=open&labels=${encodeURIComponent(label)}&per_page=1`,
      )
      if (!r.ok) return r
      const first = Array.isArray(r.value) ? r.value[0] : undefined
      return { ok: true, value: numberAt(first, 'number') ?? null }
    },

    createIssue: async (
      title: string,
      body: string,
      labels: string[],
    ): Promise<Result<number, string>> => {
      const r = await call('POST', '/issues', { title, body, labels })
      if (!r.ok) return r
      const n = numberAt(r.value, 'number')
      return n === undefined
        ? { ok: false, error: 'GitHub: created issue has no number' }
        : { ok: true, value: n }
    },

    comment: (issue: number, body: string) =>
      ignore(call('POST', `/issues/${issue}/comments`, { body })),

    updateBody: (issue: number, body: string) =>
      ignore(call('PATCH', `/issues/${issue}`, { body })),

    close: async (issue: number, comment: string): Promise<Result<null, string>> => {
      const c = await ignore(call('POST', `/issues/${issue}/comments`, { body: comment }))
      if (!c.ok) return c
      return ignore(
        call('PATCH', `/issues/${issue}`, { state: 'closed', state_reason: 'completed' }),
      )
    },

    /** 無ければ作る。既にあれば何もしない（422 は成功扱い） */
    ensureLabel: async (
      name: string,
      color: string,
      description: string,
    ): Promise<Result<null, string>> => {
      const r = await call('POST', '/labels', { name, color, description })
      if (r.ok || r.error.includes(' 422 ')) return { ok: true, value: null }
      return r
    },
  }
}
