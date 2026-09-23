import { err, ok, type Result } from '@rimltools/contract'

export type Credential = { user: string; password: string }
export type Credentials = { read: Credential; write: Credential }
export type Role = 'read' | 'write'
export type AuthError = 'unauthorized' | 'forbidden' | 'misconfigured'

/**
 * 設定されたパスワードの最短の長さ。短い値が設定されていたら全リクエストを拒否する。
 * tfstate には rate limiting が掛かっていない（Free の 1 本は /api/auth/ に使っている）ので、
 * 総当たりへの守りは長さになる。`openssl rand -base64 48`（64 文字）を想定
 */
export const MIN_SECRET_LENGTH = 32

export const parseBasicAuth = (header: string | null): Result<Credential, 'malformed'> => {
  if (header === null || !header.startsWith('Basic ')) return err('malformed')
  let decoded: string
  try {
    decoded = atob(header.slice('Basic '.length).trim())
  } catch {
    return err('malformed')
  }
  const colon = decoded.indexOf(':')
  if (colon < 0) return err('malformed')
  return ok({ user: decoded.slice(0, colon), password: decoded.slice(colon + 1) })
}

/**
 * 長さが違っても、最後まで比較してから結果を返す（タイミング攻撃で一致した長さや
 * 先頭の文字を推測させない）。
 */
export const constantTimeEqual = (a: string, b: string): boolean => {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  const length = Math.max(x.length, y.length)
  let diff = x.length ^ y.length
  for (let i = 0; i < length; i += 1) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

const matches = (given: Credential, expected: Credential): boolean =>
  // 両方を必ず評価する（短絡評価で user の一致を漏らさない）
  [
    constantTimeEqual(given.user, expected.user),
    constantTimeEqual(given.password, expected.password),
  ].every(Boolean)

const configured = (c: Credential): boolean =>
  c.user.length > 0 && c.password.length >= MIN_SECRET_LENGTH

/** read は GET だけ。write は全メソッド（ロック・書き込み・削除）。 */
export const authorize = (
  header: string | null,
  method: string,
  credentials: Credentials,
): Result<Role, AuthError> => {
  if (!configured(credentials.read) || !configured(credentials.write)) return err('misconfigured')
  const given = parseBasicAuth(header)
  if (!given.ok) return err('unauthorized')
  const isWrite = matches(given.value, credentials.write)
  const isRead = matches(given.value, credentials.read)
  if (isWrite) return ok('write')
  if (!isRead) return err('unauthorized')
  return method === 'GET' ? ok('read') : err('forbidden')
}
