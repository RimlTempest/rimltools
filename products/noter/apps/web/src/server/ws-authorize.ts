/**
 * `/ws/:documentId` の認可。
 *
 * **plan 004 がこのファイルを丸ごと差し替える**（セッション → `document` +
 * `document_member` → ロール）。この時点では認証も文書テーブルも無いので、
 * ローカル開発でだけ通す穴を開けている。
 *
 * `NOTER_DEV_OPEN_WS` は `.dev.vars`（gitignore 済み）と e2e の起動環境にだけ書く。
 * `wrangler.jsonc` の `vars` には**絶対に書かない**（CI の guard が落とす）。
 */
import type { DocumentId, Result, UserId } from '@noter/contract'
import { err, newUserId, ok } from '@noter/contract'
import type { RoomIdentity } from '@noter/sync/contract'

export type WsAuthorizeError = 'unauthorized' | 'not_found'

/**
 * `CloudflareEnv` には現れない開発用フラグを、構造的な型で受ける。
 * `wrangler types` は `.dev.vars` の内容を型に出さない。
 */
export type WsAuthorizeEnv = {
  readonly NOTER_DEV_OPEN_WS?: string
}

const DEV_NAME_FALLBACK = 'dev'

/**
 * 表示名から決定的に `UserId` を作る。同じ名前で入り直すと同じ actor になるので、
 * `/kick` や presence の挙動を手元で確かめられる。
 */
const devActorId = (name: string): Result<UserId, { readonly kind: 'invalid_id' }> => {
  const source = new TextEncoder().encode(name.length > 0 ? name : DEV_NAME_FALLBACK)
  return newUserId((byteLength: number) => {
    const bytes = new Uint8Array(byteLength)
    for (let index = 0; index < byteLength; index += 1) {
      bytes[index] = source[index % source.length] ?? 0
    }
    return bytes
  })
}

export const authorizeWs = (
  request: Request,
  env: WsAuthorizeEnv,
  _documentId: DocumentId,
): Promise<Result<RoomIdentity, WsAuthorizeError>> => {
  if (env.NOTER_DEV_OPEN_WS !== '1') return Promise.resolve(err('unauthorized'))

  const name = new URL(request.url).searchParams.get('name') ?? DEV_NAME_FALLBACK
  const actorId = devActorId(name)
  if (!actorId.ok) return Promise.resolve(err('unauthorized'))

  return Promise.resolve(ok({ role: 'editor', actorId: actorId.value, name }))
}
