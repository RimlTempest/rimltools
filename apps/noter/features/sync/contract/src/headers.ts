/**
 * web Worker → DocumentRoom(DO) の身元ヘッダ（`docs/realtime-protocol.md` §1）。
 *
 * DO は到達経路が binding のみなので値を**信じる**が、パースはする。
 * 壊れていれば web 側のバグなので `4400` で閉じる。
 */
import type { Result, Role, UserId } from '@noter/contract'
import { MAX_DISPLAY_NAME, err, ok, parseRole, parseUserId } from '@noter/contract'

export const HEADER_ROLE = 'X-Noter-Role'
export const HEADER_ACTOR = 'X-Noter-Actor'
export const HEADER_NAME = 'X-Noter-Name'

export type RoomIdentity = {
  readonly role: Role
  readonly actorId: UserId
  /** 表示名。`MAX_DISPLAY_NAME` 以内に切り詰め済み。 */
  readonly name: string
}

export type IdentityParseError = {
  readonly kind: 'invalid_identity'
  readonly field: 'role' | 'actor' | 'name'
}

const invalid = (field: IdentityParseError['field']): IdentityParseError => ({
  kind: 'invalid_identity',
  field,
})

/** サロゲートペアの途中で切らないよう、コードポイント単位で数える。 */
const truncate = (name: string): string => Array.from(name).slice(0, MAX_DISPLAY_NAME).join('')

/** `decodeURIComponent` は不正な入力で例外を投げるので、ここで値に変換する。 */
const decodeName = (raw: string): Result<string, IdentityParseError> => {
  try {
    const decoded = truncate(decodeURIComponent(raw))
    return decoded.length > 0 ? ok(decoded) : err(invalid('name'))
  } catch {
    return err(invalid('name'))
  }
}

export const encodeIdentity = (identity: RoomIdentity): Headers =>
  new Headers({
    [HEADER_ROLE]: identity.role,
    [HEADER_ACTOR]: identity.actorId,
    [HEADER_NAME]: encodeURIComponent(truncate(identity.name)),
  })

export const parseIdentity = (headers: Headers): Result<RoomIdentity, IdentityParseError> => {
  const role = parseRole(headers.get(HEADER_ROLE) ?? '')
  if (!role.ok) return err(invalid('role'))

  const actorId = parseUserId(headers.get(HEADER_ACTOR) ?? '')
  if (!actorId.ok) return err(invalid('actor'))

  const name = decodeName(headers.get(HEADER_NAME) ?? '')
  if (!name.ok) return name

  return ok({ role: role.value, actorId: actorId.value, name: name.value })
}
