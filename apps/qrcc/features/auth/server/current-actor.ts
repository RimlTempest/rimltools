/**
 * セッションから `Actor` を取り出す。実装は `@rimltools/auth/server`（plan 001 段階 3）。
 * ID は必ず `parseUserId` を通し、通らないものは visitor として扱う
 * （壊れた ID をそのまま qrcc-api の actor に流さない / ADR-0002）。
 */
import { makeCurrentActor as makeSharedCurrentActor, makeToActor } from '@rimltools/auth/server'
import type { GetSession } from '@rimltools/auth/server'
import { GUEST_DISPLAY_NAME } from './auth-options.ts'

export type { AuthSessionSnapshot, GetSession } from '@rimltools/auth/server'

export const toActor = makeToActor({
  guestDisplayName: GUEST_DISPLAY_NAME,
  userFallbackName: 'サインイン中',
})

/** リクエストの Cookie から `Actor` を作る。セッションの取得が失敗しても visitor として扱う。 */
export const makeCurrentActor = (getSession: GetSession) =>
  makeSharedCurrentActor(toActor, getSession)
