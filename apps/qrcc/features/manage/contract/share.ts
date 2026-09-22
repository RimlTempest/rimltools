/**
 * 共有リンク（docs/domain-model.md 7 節）。
 *
 * 「作ってよいか」の判定は `@qrcc/auth/contract` の `authorizeShareLink` が持つ。
 * ここにあるのは、判定を通ったあとの値をワイヤに載せる／読み戻す部分だけ。
 * ゲストの制約（編集権限・無期限を作れない）を二重に書かないための分担。
 */
import type { CodeId, ShareToken } from '@qrcc/contract'
import { ok, parseCodeId, parseShareToken } from '@qrcc/contract'
import type { SharePermission } from '@qrcc/auth/contract'
import type { Decoded } from './wire.ts'
import { fail, isRecord, readDate, readNullableDate, readString, toUnixSeconds } from './wire.ts'

export type ShareLink = {
  readonly token: ShareToken
  readonly codeId: CodeId
  readonly permission: SharePermission
  /** `undefined` は無期限。ゲストは作れない。 */
  readonly expiresAt: Date | undefined
  readonly createdAt: Date
  /** 取り消し済みなら日時が入る。行は消さず印を付ける。 */
  readonly revokedAt: Date | undefined
}

/** 共有リンクを発行するときに送る内容。トークンは qrcc-web が発行する。 */
export type ShareDraft = {
  readonly codeId: CodeId
  readonly token: ShareToken
  readonly permission: SharePermission
  readonly expiresAt: Date | undefined
}

/** 共有リンクの置き場所。URL の形をここ 1 箇所に決める。 */
export const SHARE_PATH_PREFIX = '/shared/'

export const readPermission = (source: Record<string, unknown>): Decoded<SharePermission> => {
  const permission = readString(source, 'permission')
  return permission === 'view' || permission === 'edit'
    ? ok(permission)
    : fail(`unknown share permission: ${String(permission)}`)
}

export const decodeShareLink = (value: unknown): Decoded<ShareLink> => {
  if (!isRecord(value)) return fail('share link must be an object')

  const token = parseShareToken(readString(value, 'token') ?? '')
  if (!token.ok) return fail('share link requires a share token')
  const codeId = parseCodeId(readString(value, 'code_id') ?? '')
  if (!codeId.ok) return fail('share link requires a code id')

  const permission = readPermission(value)
  if (!permission.ok) return permission
  const expiresAt = readNullableDate(value, 'expires_at')
  if (!expiresAt.ok) return expiresAt
  const revokedAt = readNullableDate(value, 'revoked_at')
  if (!revokedAt.ok) return revokedAt

  const createdAt = readDate(value, 'created_at')
  if (createdAt === undefined) return fail('share link requires "created_at"')

  return ok({
    token: token.value,
    codeId: codeId.value,
    permission: permission.value,
    expiresAt: expiresAt.value,
    createdAt,
    revokedAt: revokedAt.value,
  })
}

export const toShareDraftWire = (draft: ShareDraft) => ({
  code_id: draft.codeId,
  token: draft.token,
  permission: draft.permission,
  expires_at: draft.expiresAt === undefined ? null : toUnixSeconds(draft.expiresAt),
})

/**
 * 末尾のスラッシュを落とす。`/\/+$/` は途中にスラッシュが大量に並ぶ入力で
 * 2 乗時間になる（ReDoS）ので、端から走査する。
 */
const trimTrailingSlashes = (value: string): string => {
  let end = value.length
  while (end > 0 && value[end - 1] === '/') end -= 1
  return value.slice(0, end)
}

/** 共有された人がそのまま開けるリンク。 */
export const shareUrl = (origin: string, token: ShareToken): string =>
  `${trimTrailingSlashes(origin)}${SHARE_PATH_PREFIX}${token}`
