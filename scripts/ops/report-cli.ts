/**
 * 日次（実際は 6 時間ごと）の SLO / エラーバジェット / 無料枠レポート。
 *
 *   bun run scripts/ops/report-cli.ts
 *
 * 環境変数:
 *   CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID  無ければ Cloudflare の集計を skip（exit 0）
 *   OPS_ISSUES=true + GITHUB_TOKEN                ダッシュボード・freeze・無料枠 Issue を更新
 */

import { loadTools, type Result } from '../lib/tools.ts'
import {
  D1_QUERY,
  parseD1Rows,
  parseWorkerRows,
  sumTraffic,
  usageOn,
  WORKERS_QUERY,
} from './analytics.ts'
import { dateRange } from './config.ts'
import { decideFreeze, decideQuotaIssue } from './incident.ts'
import { docsBase, env, summary } from './lib/env.ts'
import { type Github, githubClient } from './lib/github.ts'
import { createCloudflare } from '../lib/cloudflare.ts'
import { quotaStatus } from './quota.ts'
import { DASHBOARD_MARKER, DASHBOARD_TITLE, renderDashboard, renderFreeze } from './report.ts'
import { errorBudget } from './slo.ts'

const FREEZE_LABEL = 'release-freeze'
const FREEZE_MARKER = '<!-- rimltools:release-freeze -->'
const QUOTA_LABEL = 'free-tier'
const QUOTA_MARKER = '<!-- rimltools:free-tier -->'
const DASHBOARD_LABEL = 'ops-dashboard'

const main = async (): Promise<number> => {
  const token = env('CLOUDFLARE_API_TOKEN')
  const account = env('CLOUDFLARE_ACCOUNT_ID')
  if (token === undefined || account === undefined) {
    await summary(
      '## 運用レポート\n\nCloudflare の資格情報が未設定のため skip した（environment `production`）。',
    )
    return 0
  }

  const registry = await loadTools()
  if (!registry.ok) return fail(registry.error)
  const tools = registry.value.tools
  const now = new Date()
  const windowDays = Math.max(...tools.map((t) => t.slo.windowDays))
  const window = dateRange(now, windowDays)
  const recent = dateRange(now, 2)

  const cf = createCloudflare({ apiToken: token, fetch })
  const [workersJson, d1Json] = await Promise.all([
    cf.graphql(WORKERS_QUERY, { accountTag: account, start: window.start, end: window.end }),
    cf.graphql(D1_QUERY, { accountTag: account, start: recent.start, end: recent.end }),
  ])
  if (!workersJson.ok) return fail(workersJson.error)
  if (!d1Json.ok) return fail(d1Json.error)
  const workers = parseWorkerRows(workersJson.value)
  const d1 = parseD1Rows(d1Json.value)
  if (!workers.ok) return fail(workers.error)
  if (!d1.ok) return fail(d1.error)

  const toolRows = tools.map((t) => ({
    name: t.name,
    host: t.host,
    budget: errorBudget(
      t.slo.availability,
      sumTraffic(
        workers.value.filter((r) => r.date >= dateRange(now, t.slo.windowDays).start),
        t.services.map((w) => w.name),
      ),
    ),
  }))
  const quota = [recent.end, recent.start].map((day) => ({
    day: day === recent.end ? `${day}（本日、途中経過）` : day,
    items: quotaStatus(usageOn(day, workers.value, d1.value)),
  }))
  const dashboard = renderDashboard({
    docsBase: docsBase(),
    generatedAt: now.toISOString(),
    windowDays,
    tools: toolRows,
    quota,
    notes: [],
  })
  await summary(dashboard)

  const ghToken = env('GITHUB_TOKEN')
  if (env('OPS_ISSUES') !== 'true' || ghToken === undefined) return 0
  const gh = githubClient({
    fetch,
    token: ghToken,
    repository: env('GITHUB_REPOSITORY') ?? 'RimlTempest/rimltools',
    apiUrl: env('GITHUB_API_URL') ?? 'https://api.github.com',
  })
  const labels = await Promise.all([
    gh.ensureLabel(DASHBOARD_LABEL, '0e8a16', '運用ダッシュボード（ops.yml が更新）'),
    gh.ensureLabel(
      FREEZE_LABEL,
      'b60205',
      'エラーバジェット枯渇。open の間は機能リリースを止める（ADR-0007）',
    ),
    gh.ensureLabel(QUOTA_LABEL, 'fbca04', 'Workers Free の日次上限に近い'),
  ])
  const labelError = labels.find((r) => !r.ok)
  if (labelError !== undefined && !labelError.ok) return fail(labelError.error)

  // ダッシュボード: 1 つの Issue を上書きし続ける
  const board = await gh.findOpenIssue(DASHBOARD_LABEL, DASHBOARD_MARKER)
  if (!board.ok) return fail(board.error)
  const boardResult =
    board.value === null
      ? await gh.createIssue(DASHBOARD_TITLE, dashboard, [DASHBOARD_LABEL])
      : await gh.updateBody(board.value, dashboard)
  if (!boardResult.ok) return fail(boardResult.error)

  const exhausted = toolRows.filter((t) => t.budget.state === 'exhausted').map((t) => t.name)
  const hot = quota.flatMap((q) =>
    q.items
      .filter((i) => i.alert)
      .map((i) => `${q.day}: ${i.label} ${(i.ratio * 100).toFixed(1)}%`),
  )
  const synced = await Promise.all([syncFreeze(gh, exhausted, now), syncQuota(gh, hot, now)])
  const syncError = synced.find((r) => !r.ok)
  if (syncError !== undefined && !syncError.ok) return fail(syncError.error)
  return 0
}

const done = (r: Result<unknown, string>): Result<null, string> =>
  r.ok ? { ok: true, value: null } : r

/** release-freeze: 起票はするが、解除は人が close する（ADR-0007） */
const syncFreeze = async (
  gh: Github,
  exhausted: string[],
  now: Date,
): Promise<Result<null, string>> => {
  const open = await gh.findOpenIssue(FREEZE_LABEL, FREEZE_MARKER)
  if (!open.ok) return open
  const action = decideFreeze({ exhausted, openIssue: open.value })
  switch (action.kind) {
    case 'open':
      return done(
        await gh.createIssue(
          `🧊 release-freeze: ${exhausted.join(', ')}`,
          renderFreeze(exhausted, docsBase()),
          [FREEZE_LABEL],
        ),
      )
    case 'comment':
      return gh.comment(
        action.issue,
        `まだ枯渇している: ${exhausted.join(', ')}（${now.toISOString()}）`,
      )
    case 'recovered':
      return gh.comment(
        action.issue,
        `バジェットは回復した（${now.toISOString()}）。確認のうえ人が close する。`,
      )
    case 'none':
      return { ok: true, value: null }
  }
}

/** 無料枠: 閾値超えで起票、下回ったら close */
const syncQuota = async (gh: Github, hot: string[], now: Date): Promise<Result<null, string>> => {
  const open = await gh.findOpenIssue(QUOTA_LABEL, QUOTA_MARKER)
  if (!open.ok) return open
  const action = decideQuotaIssue({ alerting: hot.length > 0, openIssue: open.value })
  const list = hot.map((h) => `- ${h}`).join('\n')
  switch (action.kind) {
    case 'open':
      return done(
        await gh.createIssue(
          '⚠️ Workers Free の日次上限に近づいている',
          `${QUOTA_MARKER}\n${list}\n\n対応: ${docsBase()}/docs/runbooks/free-tier-exhausted.md`,
          [QUOTA_LABEL],
        ),
      )
    case 'comment':
      return gh.comment(action.issue, `${now.toISOString()}\n\n${list}`)
    case 'close':
      return gh.close(action.issue, `閾値を下回った（${now.toISOString()}）。自動で close する。`)
    case 'none':
      return { ok: true, value: null }
  }
}

const fail = (message: string): number => {
  console.error(message)
  return 1
}

process.exitCode = await main()
