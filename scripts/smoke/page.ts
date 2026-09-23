import { ASSET_SCOPES, extractAssets } from '../lib/html-assets.ts'

/**
 * デプロイ後の疎通確認のうち、プロダクトに依らない部分（qrcc / noter 共通、plan 001 段階 3）。
 *
 * 一度、**エントリチャンクだけが 500 を返して**クライアント JS が丸ごと動かない状態が本番に残った。
 * HTML は 200 で返り、見た目も SSR のぶんは出るので、トップを開くだけでは気づけなかった。
 * そこで「HTML が参照している資産を全部取りに行き、1 本でも 200 で中身が返らなければ落とす」ところまでを
 * 機械で確かめる。プロダクト固有の確認（noter の WebSocket の入口など）は各プロダクトの `scripts/smoke.ts` が足す。
 *
 * 判定と表示は I/O を持たない関数に切り出してある。ネットワークに触るのは `probePage` だけで、
 * fetch は引数で受け取るのでテストから差し替えられる。
 *
 * release（`scripts/release/smoke.ts`）と ops（`scripts/ops/synthetic.ts`）にも資産の抽出があるが、
 * 見る範囲が違う（release はアイコン・manifest・画像まで、ops は 30 分ごとなので最小限）ので寄せていない。
 */

export type AssetProbe = {
  readonly path: string
  readonly status: number
  readonly bytes: number
}

export type PageSmoke = {
  readonly documentStatus: number
  readonly documentBytes: number
  readonly assets: readonly AssetProbe[]
}

export type SmokeVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly reasons: readonly string[] }

/**
 * HTML が参照している自分のオリジンの資産。
 *
 * `/assets/` に限るのは、外部 CDN やファビコンまで叩くと**他人の障害でデプロイが落ちる**ため。
 * ここで見たいのは「自分がアップロードしたものが配信されているか」だけ。
 */
export const referencedAssets = (html: string): readonly string[] =>
  // 相対パスだけを見たいので、仮のオリジンで解決して path + query に戻す
  extractAssets(html, 'https://page.invalid/', ASSET_SCOPES.deployedAssets)
    .map((href) => {
      const url = new URL(href)
      return `${url.pathname}${url.search}`
    })
    .toSorted()

/** ページと資産についての不合格の理由（プロダクト固有の理由はこの後ろに足す）。 */
export const pageReasons = (result: PageSmoke): string[] => {
  const reasons: string[] = []

  if (result.documentStatus !== 200) {
    reasons.push(`トップが ${result.documentStatus} を返した`)
  }
  // HTML は返るのにビルド成果物が繋がっていない状態を、200 だけ見て見逃さない
  if (result.documentStatus === 200 && result.assets.length === 0) {
    reasons.push('HTML から参照されている資産が 1 本も見つからない')
  }
  for (const asset of result.assets) {
    if (asset.status !== 200) {
      reasons.push(`${asset.path} が ${asset.status} を返した`)
    } else if (asset.bytes === 0) {
      reasons.push(`${asset.path} は 200 だが中身が空だった`)
    }
  }
  return reasons
}

export const verdictOf = (reasons: readonly string[]): SmokeVerdict =>
  reasons.length === 0 ? { ok: true } : { ok: false, reasons }

/** ページと資産の表示行（プロダクト固有の行はこの後ろ、`verdictLines` の前に足す）。 */
export const pageLines = (result: PageSmoke): string[] => {
  const lines = [
    `トップ: ${result.documentStatus} / ${result.documentBytes} bytes / 参照資産 ${result.assets.length} 本`,
  ]
  for (const asset of result.assets) {
    const mark = asset.status === 200 && asset.bytes > 0 ? '✓' : '✘'
    lines.push(`  ${mark} ${asset.status} ${String(asset.bytes).padStart(8)} B  ${asset.path}`)
  }
  return lines
}

export const verdictLines = (verdict: SmokeVerdict): string[] => [
  '',
  verdict.ok ? '疎通確認: 合格' : `疎通確認: 不合格\n  - ${verdict.reasons.join('\n  - ')}`,
]

export type FetchLike = (
  url: string,
) => Promise<{ readonly status: number; text: () => Promise<string> }>

/** ページと、そこから参照される資産を取りに行く。 */
export const probePage = async (baseUrl: string, fetchLike: FetchLike): Promise<PageSmoke> => {
  const document = await fetchLike(baseUrl)
  const html = await document.text()
  const paths = document.status === 200 ? referencedAssets(html) : []

  // 直列にすると本数ぶん待つだけなので並列で叩く
  const assets = await Promise.all(
    paths.map(async (path): Promise<AssetProbe> => {
      const response = await fetchLike(new URL(path, baseUrl).toString())
      const body = await response.text()
      return { path, status: response.status, bytes: body.length }
    }),
  )

  return { documentStatus: document.status, documentBytes: html.length, assets }
}
