/**
 * @noter/auth のドメインロジック。I/O は持たず、すべて引数で受け取る。
 */
export type {
  MarkOutcome,
  PromoteDeps,
  PromoteGuestAccount,
  PromotionError,
  PromotionIoError,
  PromotionOutcome,
  PromotionRecord,
} from './promote-account.ts'
export { makePromoteGuestAccount } from './promote-account.ts'
