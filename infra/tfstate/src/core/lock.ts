import { err, ok, type Result } from '@rimltools/contract'

export type Lock = { id: string; info: string }

const MAX_LOCK_INFO_BYTES = 8_192

/** LOCK / UNLOCK の本文（OpenTofu の LockInfo JSON）から ID を取り出す。本文はそのまま保持する */
export const parseLockInfo = (body: string): Result<Lock, string> => {
  if (new TextEncoder().encode(body).length > MAX_LOCK_INFO_BYTES) return err('lock info too large')
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return err('lock info is not JSON')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return err('lock info is not a JSON object')
  }
  const id: unknown = Reflect.get(parsed, 'ID')
  if (typeof id !== 'string' || id.length === 0) return err('lock info has no ID')
  return ok({ id, info: body })
}
