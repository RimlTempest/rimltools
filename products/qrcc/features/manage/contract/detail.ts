/**
 * コード 1 件と、その共有リンクをまとめて運ぶ形。
 *
 * `code.ts` と `share.ts` の**両方**を使うので、独立したモジュールに置く
 * （どちらかに寄せると相互 import になり、`import/no-cycle` が落ちる）。
 * 詳細と共有リンクを同じ応答で返すのは、画面あたりの往復を 1 回に保つため
 * （docs/free-tier-budget.md の「1 画面 1 リクエスト」）。
 */
import { ok } from '@qrcc/contract'
import type { SharePermission } from '@qrcc/auth/contract'
import type { SavedCode } from './code.ts'
import { decodeSavedCode } from './code.ts'
import type { ShareLink } from './share.ts'
import { decodeShareLink, readPermission } from './share.ts'
import type { Decoded } from './wire.ts'
import { fail, isRecord } from './wire.ts'

export type CodeDetail = {
  readonly code: SavedCode
  readonly shares: readonly ShareLink[]
}

/** 共有リンクを開いた人が見るもの。サインインは要らない。 */
export type SharePreview = {
  readonly permission: SharePermission
  readonly code: SavedCode
}

export const decodeCodeDetail = (value: unknown): Decoded<CodeDetail> => {
  if (!isRecord(value)) return fail('code detail must be an object')
  const code = decodeSavedCode(value['code'])
  if (!code.ok) return code

  const rawShares = value['shares']
  if (!Array.isArray(rawShares)) return fail('code detail requires a "shares" array')
  const shares: ShareLink[] = []
  for (const raw of rawShares) {
    const share = decodeShareLink(raw)
    if (!share.ok) return share
    shares.push(share.value)
  }
  return ok({ code: code.value, shares })
}

export const decodeSharePreview = (value: unknown): Decoded<SharePreview> => {
  if (!isRecord(value)) return fail('share preview must be an object')
  const permission = readPermission(value)
  if (!permission.ok) return permission
  const code = decodeSavedCode(value['code'])
  return code.ok ? ok({ permission: permission.value, code: code.value }) : code
}
