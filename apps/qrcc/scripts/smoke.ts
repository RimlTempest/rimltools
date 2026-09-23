/**
 * デプロイ後の疎通確認（qrcc）。
 *
 * 判定・表示・取得の本体はリポジトリ直下の `scripts/smoke/page.ts`（qrcc / noter 共通、plan 001 段階 3）。
 * qrcc はページと参照資産だけを確かめる。
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

export type SmokeResult = PageSmoke

export const smokeVerdict = (result: SmokeResult): SmokeVerdict => verdictOf(pageReasons(result))

export const describeSmokeResult = (result: SmokeResult): string =>
  [...pageLines(result), ...verdictLines(smokeVerdict(result))].join('\n')

/** 実際にネットワークへ出る唯一の場所。 */
export const runSmoke = (baseUrl: string, fetchLike: FetchLike): Promise<SmokeResult> =>
  probePage(baseUrl, fetchLike)
