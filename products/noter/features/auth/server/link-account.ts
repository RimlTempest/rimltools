/**
 * ゲストが Google でログインしたときに呼ばれる連携フック。
 *
 * **ここで例外を投げない。** anonymous プラグインはログインの応答を返す途中で
 * このフックを呼ぶので、投げるとログインごと失敗する。移譲に失敗しても
 * ログインは成立させ、失敗は記録に残して次回のリトライに任せる
 * （移譲は冪等なので、あとから何度でもやり直せる）。
 */
import type { Result } from '@noter/contract'
import { parseUserId } from '@noter/contract'
import type { PromotionError, PromotionOutcome, PromotionRecord } from '../core/promote-account.ts'
import type { LinkedAccounts } from './auth-options.ts'

export type HandleLinkAccountDeps = {
  readonly promote: (record: PromotionRecord) => Promise<Result<PromotionOutcome, PromotionError>>
  /** 失敗の記録先。ログ出力の実体は composition root が決める。 */
  readonly reportFailure: (detail: string) => void
}

export const makeHandleLinkAccount =
  (deps: HandleLinkAccountDeps) =>
  async (linked: LinkedAccounts): Promise<void> => {
    const fromUserId = parseUserId(linked.anonymousUser.user.id)
    const toUserId = parseUserId(linked.newUser.user.id)
    if (!fromUserId.ok || !toUserId.ok) {
      deps.reportFailure(
        `移譲元/先の UserId を解釈できなかった: from=${linked.anonymousUser.user.id} to=${linked.newUser.user.id}`,
      )
      return
    }

    const promoted = await deps.promote({
      fromUserId: fromUserId.value,
      toUserId: toUserId.value,
    })
    if (!promoted.ok) {
      deps.reportFailure(`ゲストの文書を移譲できなかった: ${promoted.error.kind}`)
    }
  }
