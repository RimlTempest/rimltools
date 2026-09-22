/**
 * `Actor` を server function の戻り値として運ぶための形。
 *
 * 境界を越える値は必ずパースする。`Date` や Branded 型はそのままでは
 * ワイヤに乗らないので、文字列にして、受け側で必ず検証し直す。
 * 検証できないものは **visitor 扱い**にする（安全側に倒す）。
 */
import { parseUserId } from '@rimltools/contract'
import type { Actor } from './actor.ts'

export type ActorWire =
  | { readonly kind: 'visitor' }
  | {
      readonly kind: 'guest'
      readonly userId: string
      readonly displayName: string
      readonly sessionExpiresAt: string
    }
  | { readonly kind: 'user'; readonly userId: string; readonly displayName: string }

export const toActorWire = (actor: Actor): ActorWire => {
  switch (actor.kind) {
    case 'visitor':
      return { kind: 'visitor' }
    case 'guest':
      return {
        kind: 'guest',
        userId: actor.userId,
        displayName: actor.displayName,
        sessionExpiresAt: actor.sessionExpiresAt.toISOString(),
      }
    case 'user':
      return { kind: 'user', userId: actor.userId, displayName: actor.displayName }
  }
}

const VISITOR: Actor = { kind: 'visitor' }

const readString = (source: Record<string, unknown>, key: string): string | undefined => {
  const value = source[key]
  return typeof value === 'string' ? value : undefined
}

export const parseActorWire = (value: unknown): Actor => {
  if (typeof value !== 'object' || value === null) return VISITOR
  const source: Record<string, unknown> = { ...value }
  const kind = readString(source, 'kind')
  if (kind !== 'guest' && kind !== 'user') return VISITOR

  const userId = parseUserId(readString(source, 'userId') ?? '')
  if (!userId.ok) return VISITOR
  const displayName = readString(source, 'displayName') ?? ''

  if (kind === 'user') return { kind, userId: userId.value, displayName }

  const expiresAt = new Date(readString(source, 'sessionExpiresAt') ?? '')
  if (Number.isNaN(expiresAt.getTime())) return VISITOR
  return { kind, userId: userId.value, displayName, sessionExpiresAt: expiresAt }
}
