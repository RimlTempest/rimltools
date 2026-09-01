/**
 * ゲストが Google で続けたときに呼ばれる連携フック。
 *
 * **ここで例外を投げない。** anonymous プラグインはサインインの応答を返す
 * 途中でこのフックを呼ぶので、投げるとサインインごと失敗する。移譲に失敗しても
 * サインインは成立させ、失敗は記録に残して次回のリトライに任せる
 * （移譲は冪等なので、あとから何度でもやり直せる）。
 */
import type { Result } from '@qrcc/contract'
import { parseUserId } from '@qrcc/contract'
import type { PromotionError, PromotionOutcome, PromoteInput } from '../core/promote-account.ts'
import type { LinkedAccounts } from './auth-options.ts'

export type HandleLinkAccountDeps = {
  readonly promote: (input: PromoteInput) => Promise<Result<PromotionOutcome, PromotionError>>
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
      deps.reportFailure(`ゲストのデータを移譲できなかった: ${promoted.error.kind}`)
    }
  }
