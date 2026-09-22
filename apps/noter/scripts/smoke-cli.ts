/**
 * `bun run smoke [URL]` の入口。判定は `smoke.ts`、引数・表示・終了コードは
 * リポジトリ直下の `scripts/smoke/cli.ts`（qrcc / noter 共通）。
 */
import { runSmokeCli } from '../../../scripts/smoke/cli.ts'
import { describeSmokeResult, runSmoke, smokeVerdict } from './smoke.ts'

await runSmokeCli({
  defaultUrl: 'https://noter.riml4i.com/',
  userAgent: 'noter-smoke',
  run: runSmoke,
  describe: describeSmokeResult,
  verdict: smokeVerdict,
})
