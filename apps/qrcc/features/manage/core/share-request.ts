/**
 * 共有リンクを発行する（純粋）。
 *
 * **ゲストの制約はここに書かない。** 「編集権限は作れない」「無期限は作れない」
 * は `@qrcc/auth/contract` の `authorizeShareLink` が持っていて、
 * ここはその判定を通った値をトークンと組にするだけ。
 * 判定を写すと、認証の決め事が変わったときに片方だけ古くなる。
 *
 * 乱数と時計は引数で受け取る（この層に I/O はない）。
 */
import type { CodeId, RandomBytes, Result, ShareToken } from '@qrcc/contract'
import { err, newShareToken, ok } from '@qrcc/contract'
import type { Actor, ShareLinkDenied, ShareLinkRequest } from '@qrcc/auth/contract'
import { authorizeShareLink } from '@qrcc/auth/contract'
import type { ShareDraft } from '@qrcc/manage/contract'

export type ShareDraftError =
  | ShareLinkDenied
  /** 乱数から正しい形のトークンを作れなかった。起こるなら乱数源の不具合。 */
  | { readonly kind: 'token_generation_failed' }

type ShareDraftDeps = {
  readonly now: () => Date
  readonly randomBytes: RandomBytes
}

export type CreateShareDraft = (
  actor: Actor,
  codeId: CodeId,
  request: ShareLinkRequest,
) => Result<ShareDraft, ShareDraftError>

export const makeCreateShareDraft = (deps: ShareDraftDeps): CreateShareDraft => {
  const authorize = authorizeShareLink(deps.now)

  return (actor, codeId, request) => {
    const grant = authorize(actor, request)
    if (!grant.ok) return grant

    const token: Result<ShareToken, unknown> = newShareToken(deps.randomBytes)
    if (!token.ok) return err({ kind: 'token_generation_failed' })

    return ok({
      codeId,
      token: token.value,
      permission: grant.value.permission,
      expiresAt: grant.value.expiresAt,
    })
  }
}
