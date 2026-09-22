/**
 * ゲストが Google でサインインしたときに呼ばれる連携フック。
 * 実装は `@rimltools/auth/server`（plan 001 段階 3）。**例外を投げない**
 * （投げるとサインインごと失敗する。移譲の失敗は記録して次回に任せる）。
 */
import type { Result } from '@qrcc/contract'
import { makeHandleLinkAccount as makeSharedHandleLinkAccount } from '@rimltools/auth/server'
import type { PromotionError, PromotionOutcome, PromoteInput } from '../core/promote-account.ts'

export type HandleLinkAccountDeps = {
  readonly promote: (input: PromoteInput) => Promise<Result<PromotionOutcome, PromotionError>>
  /** 失敗の記録先。ログ出力の実体は composition root が決める。 */
  readonly reportFailure: (detail: string) => void
}

export const makeHandleLinkAccount = (deps: HandleLinkAccountDeps) =>
  makeSharedHandleLinkAccount({ ...deps, subject: 'データ' })
