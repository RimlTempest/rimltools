/**
 * synthetic 監視（ops.yml から 30 分ごと）。
 *
 *   bun run scripts/ops/synthetic-cli.ts
 *
 * 環境変数:
 *   OPS_HOST_OVERRIDES  監視先ホストの上書き（JSON）。新ドメインへの切替前に使う
 *   OPS_ISSUES=true     Issue の起票・close を行う（既定は結果の表示だけ）
 *   GITHUB_TOKEN        Issue 操作用（issues: write）
 *   OPS_RETRY_DELAY_MS  再確認までの待ち（既定 60000）
 */

import { loadTools, type Result } from '../lib/tools.ts'
import { parseHostOverrides, resolveTargets } from './config.ts'
import { decideIncident } from './incident.ts'
import { docsBase, env, summary } from './lib/env.ts'
import { type Github, githubClient } from './lib/github.ts'
import { EXTRA_CHECKS, probeWithRetry, type RetryResult, type Target } from './probe.ts'
import { renderIncident } from './report.ts'

const INCIDENT_LABEL = 'incident'

const main = async (): Promise<number> => {
  const registry = await loadTools()
  if (!registry.ok) return fail(registry.error)
  const overrides = parseHostOverrides(env('OPS_HOST_OVERRIDES'))
  if (!overrides.ok) return fail(overrides.error)

  const targets = resolveTargets(
    registry.value.tools.map((t) => ({ name: t.name, host: t.host })),
    overrides.value,
  )
  const delay = Number(env('OPS_RETRY_DELAY_MS') ?? '60000')
  const deps = { fetch, sleep: (ms: number) => Bun.sleep(ms) }

  const results = await Promise.all(
    targets.map(async (t) => ({
      target: t,
      result: await probeWithRetry(deps, t, EXTRA_CHECKS[t.name] ?? [], delay),
    })),
  )

  await summary(renderSummary(results))

  const token = env('GITHUB_TOKEN')
  if (env('OPS_ISSUES') === 'true' && token !== undefined) {
    const gh = githubClient({
      fetch,
      token,
      repository: env('GITHUB_REPOSITORY') ?? 'RimlTempest/rimltools',
      apiUrl: env('GITHUB_API_URL') ?? 'https://api.github.com',
    })
    const label = await gh.ensureLabel(
      INCIDENT_LABEL,
      'd73a4a',
      '本番の異常（ops.yml の synthetic 監視）',
    )
    if (!label.ok) return fail(label.error)
    const outcomes = await Promise.all(
      results.map(({ target, result }) => syncIncident(gh, target, result)),
    )
    const error = outcomes.find((r) => !r.ok)
    if (error !== undefined && !error.ok) return fail(error.error)
  }

  return results.some((r) => r.result.failing) ? 1 : 0
}

/** 1 ツール分の incident Issue を、結果に合わせて起票・追記・close する */
const syncIncident = async (
  gh: Github,
  target: Target,
  result: RetryResult,
): Promise<Result<null, string>> => {
  const marker = `<!-- rimltools:incident:${target.name} -->`
  const open = await gh.findOpenIssue(INCIDENT_LABEL, marker)
  if (!open.ok) return open
  const action = decideIncident({ failing: result.failing, openIssue: open.value })
  const failures = result.last.failures.map((f) => `- ${f}`).join('\n')
  const now = new Date().toISOString()
  switch (action.kind) {
    case 'open': {
      const r = await gh.createIssue(
        `🚨 [incident] ${target.name} の synthetic 監視が失敗`,
        renderIncident(target.name, target.host, result.last.failures, docsBase()),
        [INCIDENT_LABEL],
      )
      return r.ok ? { ok: true, value: null } : r
    }
    case 'comment':
      return gh.comment(action.issue, `まだ失敗している（${now}）\n\n${failures}`)
    case 'close':
      return gh.close(action.issue, `✅ 回復を確認した（${now}）。自動で close する。`)
    case 'none':
      return { ok: true, value: null }
  }
}

const renderSummary = (
  results: { target: { name: string; host: string }; result: RetryResult }[],
) =>
  [
    '## synthetic 監視',
    '',
    '| ツール | ホスト | 結果 | 確認数 |',
    '| --- | --- | --- | --- |',
    ...results.map(({ target, result }) => {
      const state = result.failing
        ? '🔴 失敗（2 回連続）'
        : result.first.ok
          ? '🟢 OK'
          : '🟡 再確認で回復'
      return `| ${target.name} | ${target.host} | ${state} | ${result.last.checks.length} |`
    }),
    '',
    ...results.flatMap(({ target, result }) =>
      result.last.failures.length === 0
        ? []
        : [`### ${target.name}`, ...result.last.failures.map((f) => `- ${f}`), ''],
    ),
  ].join('\n')

const fail = (message: string): number => {
  console.error(message)
  return 2
}

process.exitCode = await main()
