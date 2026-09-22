/**
 * 同期の進み具合。
 *
 * v1 のサーバは「書けた」を通知しない（ADR-0005）。`saved` は
 * **クライアント側の推定**で、`PERSIST_DELAY_MS` を過ぎた更新を届いたとみなす。
 * サーバ通知を入れるときは `docs/realtime-protocol.md` §8 の手順に従う。
 */
export type SaveState =
  /** `at` は推定が立った時刻（epoch ミリ秒）。ピルの時刻表示に使う。 */
  | { readonly kind: 'saved'; readonly at: number }
  /** 送信待ちの編集がある。 */
  | { readonly kind: 'dirty' }
