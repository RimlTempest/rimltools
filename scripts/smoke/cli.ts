/**
 * `bun run smoke [URL]` の入口の共通部分（qrcc / noter の `scripts/smoke-cli.ts` が使う）。
 * 判定そのものは各プロダクトの `scripts/smoke.ts` にあり、ここは引数・表示・終了コードだけを扱う。
 * 不合格なら 1 で終わるので、CI のステップとしてそのまま使える。
 */
import type { FetchLike, SmokeVerdict } from './page.ts'

export type SmokeCli<Result> = {
  readonly defaultUrl: string
  readonly userAgent: string
  readonly run: (baseUrl: string, fetchLike: FetchLike) => Promise<Result>
  readonly describe: (result: Result) => string
  readonly verdict: (result: Result) => SmokeVerdict
}

export const runSmokeCli = async <Result>(cli: SmokeCli<Result>): Promise<void> => {
  const baseUrl = process.argv[2] ?? cli.defaultUrl

  const result = await cli.run(baseUrl, (url) =>
    fetch(url, {
      // 直前のデプロイを確実に見るため、途中のキャッシュを避ける
      cache: 'no-store',
      headers: { 'user-agent': cli.userAgent },
    }),
  )

  console.log(`対象: ${baseUrl}`)
  console.log(cli.describe(result))

  if (!cli.verdict(result).ok) process.exit(1)
}
