/**
 * ゲストが Google でサインインしたときに呼ばれる連携フック（qrcc / noter 共通）。
 *
 * **ここで例外を投げない。** anonymous プラグインはサインインの応答を返す途中で
 * このフックを呼ぶので、投げるとサインインごと失敗する。移譲に失敗しても
 * サインインは成立させ、失敗は記録に残して次回のリトライに任せる
 * （移譲は冪等なので、あとから何度でもやり直せる）。
 */
import type { Result, UserId } from '@rimltools/contract'
import { parseUserId } from '@rimltools/contract'
import type { LinkedAccounts } from './auth-options.ts'

export type PromoteAccountInput = { readonly fromUserId: UserId; readonly toUserId: UserId }

export type HandleLinkAccountDeps = {
  readonly promote: (
    input: PromoteAccountInput,
  ) => Promise<Result<unknown, { readonly kind: string }>>
  /** 失敗の記録先。ログ出力の実体は composition root が決める。 */
  readonly reportFailure: (detail: string) => void
  /** 移譲するものの呼び名（例: 「データ」「文書」）。失敗の記録に使う。 */
  readonly subject: string
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
      deps.reportFailure(`ゲストの${deps.subject}を移譲できなかった: ${promoted.error.kind}`)
    }
  }
