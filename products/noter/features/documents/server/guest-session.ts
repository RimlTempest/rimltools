/**
 * visitor が最初の操作をしたときにゲストを発行する（docs/design/ux.md §6.1）。
 *
 * 「開いた瞬間に書ける」ためには、ログイン画面を挟まずに文書を作れる必要がある。
 * そこで **`POST /api/auth/sign-in/anonymous` を Worker の中で自分に対して呼び**、
 * 返ってきた `Set-Cookie` を呼び出し側の応答にそのまま載せる。
 *
 * Better Auth を直接触らずハンドラ越しに呼ぶのは、この feature が認証の実体を
 * 知らずに済むようにするため（ハンドラは composition root が渡す）。
 */
import { err, ok, parseUserId } from '@noter/contract'
import type { Result, UserId } from '@noter/contract'
import type { StorageError } from './sql.ts'

const SIGN_IN_ANONYMOUS_PATH = '/api/auth/sign-in/anonymous'

export type IssuedGuest = {
  readonly userId: UserId
  readonly displayName: string
  /** 応答にそのまま載せる `Set-Cookie`。1 本とは限らない。 */
  readonly setCookies: readonly string[]
}

export type IssueGuestDeps = {
  /** `/api/auth/*` のハンドラ（`Auth['handler']`）。 */
  readonly handler: (request: Request) => Promise<Response>
  /** 自分自身のオリジン。Better Auth の `trustedOrigins` 判定に使われる。 */
  readonly origin: string
  /**
   * 応答から `Set-Cookie` を取り出す。既定は `Headers.getSetCookie()`。
   *
   * 差し替え可能にしてあるのは、テスト環境（happy-dom）の `Headers` が
   * `set-cookie` を落としてしまい、既定のままでは検証できないため。
   */
  readonly readSetCookies?: (response: Response) => readonly string[]
}

const failed = (detail: string): StorageError => ({
  kind: 'storage_unavailable',
  detail: `ゲストを発行できなかった: ${detail}`,
})

const readUser = (body: unknown): { readonly id: string; readonly name: string } | undefined => {
  if (typeof body !== 'object' || body === null) return undefined
  const user: unknown = Reflect.get(body, 'user')
  if (typeof user !== 'object' || user === null) return undefined
  const id: unknown = Reflect.get(user, 'id')
  const name: unknown = Reflect.get(user, 'name')
  if (typeof id !== 'string') return undefined
  return { id, name: typeof name === 'string' ? name : '' }
}

export const makeIssueGuest =
  (deps: IssueGuestDeps) => async (): Promise<Result<IssuedGuest, StorageError>> => {
    const request = new Request(new URL(SIGN_IN_ANONYMOUS_PATH, deps.origin), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    // Origin は Fetch 仕様の「禁止ヘッダ」なので、コンストラクタに渡すと落ちる。
    // Better Auth は CSRF 判定にこれを見るので、作ってから入れる
    request.headers.set('origin', deps.origin)

    const response = await deps.handler(request)
    if (!response.ok) return err(failed(`HTTP ${response.status}`))

    const user = readUser(await response.json())
    if (user === undefined) return err(failed('応答に user が無い'))

    const userId = parseUserId(user.id)
    if (!userId.ok) return err(failed(`UserId を解釈できない: ${userId.error.received}`))

    const readSetCookies =
      deps.readSetCookies ?? ((source: Response) => source.headers.getSetCookie())
    const setCookies = readSetCookies(response)
    if (setCookies.length === 0) return err(failed('Set-Cookie が返らなかった'))

    return ok({ userId: userId.value, displayName: user.name, setCookies })
  }
