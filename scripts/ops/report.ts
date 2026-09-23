/** 運用ダッシュボード Issue と freeze Issue の本文を作る。 */

import type { QuotaItem } from './quota.ts'
import type { BudgetState, BudgetStatus } from './slo.ts'

export const DASHBOARD_MARKER = '<!-- rimltools:ops-dashboard -->'
export const DASHBOARD_TITLE = '📊 RimlTools 運用ダッシュボード'

export type DashboardInput = {
  /** 例: https://github.com/RimlTempest/rimltools/blob/develop */
  docsBase: string
  generatedAt: string
  windowDays: number
  tools: { name: string; host: string; budget: BudgetStatus }[]
  quota: { day: string; items: QuotaItem[] }[]
  notes: string[]
}

const STATE_ICON: Record<BudgetState, string> = {
  healthy: '🟢',
  burning: '🟡',
  exhausted: '🔴',
  'no-traffic': '⚪',
}

const pct = (ratio: number, digits = 1) => `${(ratio * 100).toFixed(digits)}%`
const int = (n: number) => Math.round(n).toLocaleString('en-US')

const sloRow = ({ name, budget }: DashboardInput['tools'][number]) =>
  `| ${name} | ${budget.availability === null ? '—' : `${budget.availability.toFixed(3)}%`} | ${budget.target}% | ${pct(budget.remaining)} | ${STATE_ICON[budget.state]} ${budget.state} |`

const quotaRow = (item: QuotaItem) =>
  `| ${item.label} | ${int(item.used)} | ${int(item.limit)} | ${pct(item.ratio)}${item.alert ? ' ⚠️' : ''} |`

export const renderDashboard = (input: DashboardInput): string => {
  const lines = [
    DASHBOARD_MARKER,
    `最終更新: ${input.generatedAt}（ops.yml が自動更新する。手で編集しない）`,
    '',
    `## SLO / エラーバジェット（直近 ${input.windowDays} 日）`,
    '',
    '| ツール | 可用性 | 目標 | バジェット残 | 状態 |',
    '| --- | --- | --- | --- | --- |',
    ...input.tools.map(sloRow),
    '',
    '状態: 🟢 healthy / 🟡 burning（半分消費） / 🔴 exhausted（`release-freeze`） / ⚪ no-traffic',
    '',
    '## 無料枠（アカウント全体・日次、UTC）',
    '',
  ]
  for (const q of input.quota) {
    lines.push(`### ${q.day}`, '', '| 項目 | 使用量 | 上限 | 消費率 |', '| --- | --- | --- | --- |')
    lines.push(...q.items.map(quotaRow), '')
  }
  if (input.notes.length > 0) lines.push('## 注記', '', ...input.notes.map((n) => `- ${n}`), '')
  lines.push(
    `詳細: [docs/slo.md](${input.docsBase}/docs/slo.md) / [runbooks](${input.docsBase}/docs/runbooks/README.md)`,
  )
  return lines.join('\n')
}

export const renderFreeze = (exhausted: string[], docsBase: string): string =>
  [
    '<!-- rimltools:release-freeze -->',
    `エラーバジェットを使い切ったツール: **${exhausted.join(', ')}**`,
    '',
    'この Issue が `release-freeze` ラベル付きで open の間、Release PR は `fix:` / `revert:` 以外を含むと失敗する（ADR-0007）。',
    '',
    '解除の手順:',
    '1. 原因を修正して本番に出す（fix / revert のみ）',
    '2. ダッシュボードでバジェットが回復したことを確認する',
    '3. この Issue を close する（**自動では解除しない**）',
    '',
    `方針: ${docsBase}/docs/slo.md`,
  ].join('\n')

export const renderIncident = (
  tool: string,
  host: string,
  failures: string[],
  docsBase: string,
): string =>
  [
    `<!-- rimltools:incident:${tool} -->`,
    `synthetic 監視が **${tool}**（https://${host}/）の異常を連続で検出した。`,
    '',
    ...failures.map((f) => `- ${f}`),
    '',
    `対応手順: ${docsBase}/docs/runbooks/incident.md （回復すると自動で close される）`,
  ].join('\n')
