/**
 * 環境から「いまの呼び出し元」と「Google が使えるか」を取り出す。
 *
 * Cookie は HttpOnly なのでブラウザからは読めない。判定は必ずサーバで行い、
 * 画面には検証済みの値だけを渡す。複数のルートがこの判定を要るので、
 * 手順をここに 1 つだけ置いて写し間違いを防ぐ。
 *
 * `*.route.*` は feature に co-location されたアプリ側の配線なので、
 * composition root（`apps/web/src/server/container.ts`）を直接使ってよい。
 * feature 本体（contract / core / server / 画面）はここを import しない。
 */
import type { ActorWire } from '@noter/auth/contract'
import { toActorWire } from '@noter/auth/contract'
import type { WebEnv } from '../../../apps/web/src/server/container.ts'
import { makeContainer } from '../../../apps/web/src/server/container.ts'

/** サインイン状態と、この環境で選べるログイン手段。 */
export type AuthEnvSnapshot = {
  readonly actor: ActorWire
  readonly isGoogleAvailable: boolean
}

export const readAuthEnv = async (env: WebEnv, request: Request): Promise<AuthEnvSnapshot> => {
  const container = makeContainer(env, request)
  return {
    actor: toActorWire(await container.currentActor(request)),
    isGoogleAvailable: container.isGoogleAvailable,
  }
}

export const currentActorWire = async (env: WebEnv, request: Request): Promise<ActorWire> =>
  toActorWire(await makeContainer(env, request).currentActor(request))
