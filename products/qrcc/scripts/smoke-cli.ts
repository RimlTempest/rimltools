/**
 * `bun run smoke [URL]` の入口。
 *
 * 判定そのものは `smoke.ts` にあり、ここは引数と終了コードだけを扱う。
 * 不合格なら 1 で終わるので、CI のステップとしてそのまま使える。
 */
import { describeSmokeResult, runSmoke, smokeVerdict } from './smoke.ts'

const DEFAULT_URL = 'https://qrcc.riml4i.com/'

const baseUrl = process.argv[2] ?? DEFAULT_URL

const result = await runSmoke(baseUrl, (url) =>
  fetch(url, {
    // 直前のデプロイを確実に見るため、途中のキャッシュを避ける
    cache: 'no-store',
    headers: { 'user-agent': 'qrcc-smoke' },
  }),
)

console.log(`対象: ${baseUrl}`)
console.log(describeSmokeResult(result))

if (!smokeVerdict(result).ok) process.exit(1)
