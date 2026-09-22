/**
 * デプロイ後の疎通確認（noter）。
 *
 * ページと参照資産の確認はリポジトリ直下の `scripts/smoke/page.ts`（qrcc / noter 共通、plan 001 段階 3）。
 * noter はそれに加えて、WebSocket の入口が繋がっていることを確かめる。
 */
import {
  pageLines,
  pageReasons,
  probePage,
  verdictLines,
  verdictOf,
} from '../../../scripts/smoke/page.ts'
import type { FetchLike, PageSmoke, SmokeVerdict } from '../../../scripts/smoke/page.ts'

export type { AssetProbe, FetchLike, SmokeVerdict } from '../../../scripts/smoke/page.ts'
export { referencedAssets } from '../../../scripts/smoke/page.ts'

export type SmokeResult = PageSmoke & {
  /**
   * `/ws/:documentId` を **Upgrade ヘッダ無しで** GET したときの状態コード。
   * 426 が正解（`apps/web/src/server/ws-gate.ts`）。
   */
  readonly wsProbe: number
}

/**
 * WebSocket の入口を試す path。
 *
 * `/ws/` はルータより手前で `src/server.ts` が横取りする（ADR-0002）。
 * この配線が外れると、Upgrade 無しの GET が 426 ではなくルータの応答を
 * 返すようになり、同時編集だけが静かに死ぬ。文書 ID は実在しなくてよい
 * （Upgrade の判定が先に来るので、認可も検索も走らない）。
 */
export const WS_PROBE_PATH = '/ws/doc_000000000000000000000000'

/** Upgrade 無しの `/ws/` に期待する状態コード。 */
const WS_EXPECTED_STATUS = 426

export const smokeVerdict = (result: SmokeResult): SmokeVerdict => {
  const reasons = pageReasons(result)
  if (result.wsProbe !== WS_EXPECTED_STATUS) {
    reasons.push(
      `${WS_PROBE_PATH} が ${result.wsProbe} を返した`
        + `（${WS_EXPECTED_STATUS} のはず。WebSocket の入口が繋がっていない）`,
    )
  }
  return verdictOf(reasons)
}

export const describeSmokeResult = (result: SmokeResult): string =>
  [
    ...pageLines(result),
    `  ${result.wsProbe === WS_EXPECTED_STATUS ? '✓' : '✘'} ${result.wsProbe}`
      + `             ${WS_PROBE_PATH}（Upgrade 無し）`,
    ...verdictLines(smokeVerdict(result)),
  ].join('\n')

/** 実際にネットワークへ出る唯一の場所。 */
export const runSmoke = async (baseUrl: string, fetchLike: FetchLike): Promise<SmokeResult> => {
  const page = await probePage(baseUrl, fetchLike)

  // Upgrade を付けない。ここで見たいのは「入口が繋がっているか」だけ
  const ws = await fetchLike(new URL(WS_PROBE_PATH, baseUrl).toString())
  await ws.text()

  return { ...page, wsProbe: ws.status }
}
