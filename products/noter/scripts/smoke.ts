/**
 * デプロイ後の疎通確認。
 *
 * 一度、**エントリチャンクだけが 500 を返して**クライアント JS が丸ごと
 * 動かない状態が本番に残ったことがある。HTML は 200 で返り、見た目も
 * SSR のぶんは出るので、トップを開くだけでは気づけなかった。
 *
 * そこで「HTML が参照している資産を全部取りに行き、1 本でも 200 で
 * 中身が返らなければ落とす」ところまでを機械で確かめる。
 *
 * 判定は I/O を持たない関数に切り出してある（`referencedAssets` /
 * `smokeVerdict`）。ネットワークに触るのは `runSmoke` だけで、
 * fetch は引数で受け取るのでテストから差し替えられる。
 */

export type AssetProbe = {
  readonly path: string
  readonly status: number
  readonly bytes: number
}

export type SmokeResult = {
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
 * `/assets/` に限るのは、外部 CDN やファビコンまで叩くと**他人の障害で
 * デプロイが落ちる**ため。ここで見たいのは「自分がアップロードしたものが
 * 配信されているか」だけ。
 */
export const referencedAssets = (html: string): readonly string[] => {
  const matches = html.matchAll(/(?:href|src)="(\/assets\/[^"]+)"/g)
  const seen = new Set<string>()
  for (const match of matches) {
    const path = match[1]
    if (path !== undefined) seen.add(path)
  }
  return [...seen].toSorted()
}

export const smokeVerdict = (result: SmokeResult): SmokeVerdict => {
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

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons }
}

export const describeSmokeResult = (result: SmokeResult): string => {
  const lines = [
    `トップ: ${result.documentStatus} / ${result.documentBytes} bytes / 参照資産 ${result.assets.length} 本`,
  ]
  for (const asset of result.assets) {
    const mark = asset.status === 200 && asset.bytes > 0 ? '✓' : '✘'
    lines.push(`  ${mark} ${asset.status} ${String(asset.bytes).padStart(8)} B  ${asset.path}`)
  }
  const verdict = smokeVerdict(result)
  lines.push('')
  lines.push(
    verdict.ok ? '疎通確認: 合格' : `疎通確認: 不合格\n  - ${verdict.reasons.join('\n  - ')}`,
  )
  return lines.join('\n')
}

export type FetchLike = (
  url: string,
) => Promise<{ readonly status: number; text: () => Promise<string> }>

/** 実際にネットワークへ出る唯一の場所。 */
export const runSmoke = async (baseUrl: string, fetchLike: FetchLike): Promise<SmokeResult> => {
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
