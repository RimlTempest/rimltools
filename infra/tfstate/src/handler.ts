/**
 * OpenTofu の http backend（https://opentofu.org/docs/language/settings/backends/http/）。
 *
 *   GET    /states/<name>          state を返す（無ければ 204）
 *   POST   /states/<name>?ID=<id>  state を保存する（ロックの持ち主だけ）
 *   LOCK   /states/<name>          ロックを取る（取れなければ 423 と持ち主の LockInfo）
 *   UNLOCK /states/<name>          ロックを外す（持ち主の ID のときだけ）
 *
 * DELETE は受け付けない（405）。書き込み用の資格情報が漏れても、state と版の履歴を消せないようにする。
 * 本文は OpenTofu が暗号化した JSON で、この Worker は中身を読まない（docs/adr/0009）。
 */
import { authorize, type Credentials } from './core/auth.ts'
import { checkEncryptedState } from './core/guard.ts'
import { parseLockInfo } from './core/lock.ts'
import { parseStatePath } from './core/paths.ts'
import type { StateStore } from './store.ts'

export type LogEntry = Record<string, string | number | boolean>

export type HandlerDeps = {
  store: StateStore
  now: () => number
  credentials: Credentials
  /** ロックの有効期間。CI が落ちてロックが残っても、この時間が過ぎれば取り直せる */
  lockTtlMs: number
  /** 受け付ける state の最大バイト数 */
  maxStateBytes?: number
  log: (entry: LogEntry) => void
}

const DEFAULT_MAX_STATE_BYTES = 16 * 1024 * 1024
const METHODS = new Set(['GET', 'POST', 'LOCK', 'UNLOCK'])

const text = (status: number, body: string, headers: Record<string, string> = {}) =>
  new Response(body, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  })

const json = (status: number, body: string) =>
  new Response(body, {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

type Routed = { response: Response; authFailure?: 'unauthorized' | 'forbidden' }

const route = async (request: Request, deps: HandlerDeps): Promise<Routed> => {
  const url = new URL(request.url)
  const method = request.method.toUpperCase()

  // 認証より先にパスを見ると、存在するパスを未認証で探れてしまう。認証を先にする
  const role = authorize(request.headers.get('authorization'), method, deps.credentials)
  if (!role.ok) {
    if (role.error === 'misconfigured') {
      return { response: text(500, 'backend credentials are not configured') }
    }
    if (role.error === 'forbidden') {
      return { response: text(403, 'read-only credentials'), authFailure: 'forbidden' }
    }
    return {
      response: text(401, 'unauthorized', {
        'www-authenticate': 'Basic realm="rimltools-tfstate"',
      }),
      authFailure: 'unauthorized',
    }
  }
  return { response: await serve(request, deps, url, method) }
}

const serve = async (
  request: Request,
  deps: HandlerDeps,
  url: URL,
  method: string,
): Promise<Response> => {
  const path = parseStatePath(url.pathname)
  if (!path.ok) return text(404, 'not found')
  if (!METHODS.has(method))
    return text(405, 'method not allowed', { allow: [...METHODS].join(', ') })

  const now = deps.now()
  const { store } = deps

  if (method === 'GET') {
    const state = await store.getState(path.value)
    if (!state.ok) return text(500, 'storage error')
    return state.value === null ? new Response(null, { status: 204 }) : json(200, state.value)
  }

  if (method === 'LOCK') {
    const lock = parseLockInfo(await request.text())
    if (!lock.ok) return text(400, lock.error)
    const attempt = await store.acquireLock(path.value, lock.value, now + deps.lockTtlMs, now)
    if (!attempt.ok) return text(500, 'storage error')
    return attempt.value.acquired ? text(200, 'locked') : json(423, attempt.value.holder.info)
  }

  if (method === 'UNLOCK') {
    const lock = parseLockInfo(await request.text())
    if (!lock.ok) return text(400, lock.error)
    const held = await store.getLock(path.value, now)
    if (!held.ok) return text(500, 'storage error')
    if (held.value === null) return text(200, 'unlocked')
    if (held.value.id !== lock.value.id) return json(423, held.value.info)
    const released = await store.releaseLock(path.value, lock.value.id)
    if (!released.ok) return text(500, 'storage error')
    return text(200, 'unlocked')
  }

  // POST: ロックの持ち主（?ID= が一致）だけが書ける。
  // OpenTofu は書く前に必ずロックを取る（-lock=false の書き込みはここで拒否される）
  const held = await store.getLock(path.value, now)
  if (!held.ok) return text(500, 'storage error')
  const id = url.searchParams.get('ID')
  if (held.value === null || id === null || held.value.id !== id) {
    return text(409, 'write requires the current lock (run without -lock=false)')
  }

  const body = await request.text()
  if (new TextEncoder().encode(body).length > (deps.maxStateBytes ?? DEFAULT_MAX_STATE_BYTES)) {
    return text(413, 'state too large')
  }
  const meta = checkEncryptedState(body)
  if (!meta.ok) return text(422, `${meta.error}. Refusing to store it.`)
  const saved = await store.putState(path.value, body, meta.value, now)
  return saved.ok ? text(200, 'saved') : text(500, 'storage error')
}

export const handle = async (request: Request, deps: HandlerDeps): Promise<Response> => {
  const started = deps.now()
  const { response, authFailure } = await route(request, deps)
  // 本文・資格情報・Authorization ヘッダは絶対に出さない。path・method・結果・呼び出し元だけ
  const entry = {
    method: request.method.toUpperCase(),
    path: new URL(request.url).pathname,
    status: response.status,
    ip: request.headers.get('cf-connecting-ip') ?? 'unknown',
    ms: deps.now() - started,
  }
  deps.log({ event: 'tfstate', ...entry })
  // 総当たりの検知用（Grafana のアラート tfstate-auth-failures が数える）
  if (authFailure !== undefined)
    deps.log({ event: 'tfstate_auth_failed', result: authFailure, ...entry })
  return response
}
