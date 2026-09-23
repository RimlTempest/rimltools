/* eslint-disable no-await-in-loop -- 段階リリースは前の段の結果を見てから次へ進むのが仕様 */
import type { Result } from '../lib/tools.ts'
import type { Stats } from './analysis.ts'
import { judgeCanary } from './analysis.ts'
import type { Deployment } from './deployments.ts'
import { currentStable, versionSpecs } from './deployments.ts'
import type { Strategy } from './plan.ts'
import { overrideHeader } from './smoke.ts'

/**
 * 1 つの Worker を段階的に出す（ADR-0003）。I/O はすべて deps から受け取る。
 *
 *   upload → 0%（blue/green: override ヘッダで本番ドメインの新版だけを smoke）
 *   → steps の割合で canary（bake → エラー率を旧版と比較）→ 100% → smoke
 *
 * どこかで落ちたら、直前の安定版を 100% に戻して `rolled-back` を返す。
 * 判定に足るトラフィックが集まらないとき、版ごとに数える手段が無いとき、集計が失敗したときは
 * 割合をそのままにして `needs-human` を返す（新版が悪い根拠が無いのでロールバックしない）。
 */
export type RolloutDeps = {
  log: (message: string) => void
  upload: (
    configPath: string,
    meta: { message: string; tag: string },
  ) => Promise<Result<{ versionId: string; previewUrl: string | undefined }, string>>
  deploy: (
    workerName: string,
    specs: string[],
    message: string,
  ) => Promise<Result<undefined, string>>
  deployDirect: (
    configPath: string,
    message: string,
  ) => Promise<Result<{ versionId: string }, string>>
  deployments: (workerName: string) => Promise<Result<Deployment[], string>>
  /**
   * 版ごとの集計。undefined = 版で分けて数えられる手段が無い（sources.ts）。
   * その場合も失敗した場合も、新版が悪い根拠は無いのでロールバックせず人に委ねる。
   */
  stats:
    | ((
        workerName: string,
        since: Date,
        until: Date,
      ) => Promise<Result<Map<string, Stats>, string>>)
    | undefined
  smoke: (
    url: string,
    headers: Record<string, string>,
  ) => Promise<Result<{ assets: number }, string>>
  synthetic: (url: string, headers: Record<string, string>, count: number) => Promise<void>
  sleep: (ms: number) => Promise<void>
  now: () => Date
}

export type RolloutParams = {
  workerName: string
  configPath: string
  /** public Worker の URL。internal Worker は外から叩けないので undefined */
  url: string | undefined
  strategy: Strategy
  commit: string
  runId: string
  minSamples: number
  /** 判定不能のときに bake を延長する回数の上限 */
  maxExtensions: number
  /** resume: この版の canary を、いまの割合の次の段から続ける */
  resumeVersion?: string
}

export type RolloutOutcome =
  | { kind: 'released'; versionId: string; previous: string | undefined }
  | {
      kind: 'rolled-back'
      versionId: string | undefined
      previous: string | undefined
      reason: string
    }
  | { kind: 'needs-human'; reason: string; versionId: string; stable: string; percentage: number }
  | { kind: 'error'; reason: string }

const minute = 60_000
/** GraphQL Analytics に反映されるまでの待ち */
const analyticsLag = minute
const maxSynthetic = 300
const empty: Stats = { requests: 0, errors: 0 }

export const rolloutWorker = async (
  deps: RolloutDeps,
  params: RolloutParams,
): Promise<RolloutOutcome> => {
  const { workerName, url } = params
  const message = `${params.commit} (run ${params.runId})`

  const history = await deps.deployments(workerName)
  if (!history.ok) return { kind: 'error', reason: history.error }

  const rollback = async (
    versionId: string | undefined,
    stable: string | undefined,
    reason: string,
  ): Promise<RolloutOutcome> => {
    deps.log(`✗ ${workerName}: ${reason}`)
    if (stable !== undefined) {
      deps.log(`↩ rolling back ${workerName} to ${stable}`)
      const back = await deps.deploy(workerName, [`${stable}@100%`], `rollback: ${reason}`)
      if (!back.ok) return { kind: 'error', reason: `${reason}; rollback failed: ${back.error}` }
    }
    return { kind: 'rolled-back', versionId, previous: stable, reason }
  }

  const finalSmoke = async (versionId: string, stable: string | undefined) => {
    if (url === undefined) return undefined
    const smoke = await deps.smoke(url, {})
    return smoke.ok
      ? undefined
      : rollback(versionId, stable, `smoke at 100% failed: ${smoke.error}`)
  }

  // ── direct: Durable Object を持つ Worker（一括）──────────────────────
  if (params.strategy.kind === 'direct') {
    const stable = currentStable(history.value, '')
    const deployed = await deps.deployDirect(params.configPath, message)
    if (!deployed.ok) return { kind: 'error', reason: deployed.error }
    const failed = await finalSmoke(deployed.value.versionId, stable)
    return failed ?? { kind: 'released', versionId: deployed.value.versionId, previous: stable }
  }

  const { steps, bakeMinutes } = params.strategy

  // ── upload（resume のときは既存の版を使う）──────────────────────────
  let versionId: string
  let startAfter = 0
  if (params.resumeVersion === undefined) {
    const uploaded = await deps.upload(params.configPath, { message, tag: params.runId })
    if (!uploaded.ok) return { kind: 'error', reason: uploaded.error }
    versionId = uploaded.value.versionId
  } else {
    versionId = params.resumeVersion
    startAfter = history.value[0]?.versions.find((v) => v.versionId === versionId)?.percentage ?? 0
  }
  const stable = currentStable(history.value, versionId)

  // 初回デプロイ: 比べる相手が居ないので 100% にして smoke だけ見る
  if (stable === undefined) {
    const first = await deps.deploy(workerName, [`${versionId}@100%`], message)
    if (!first.ok) return { kind: 'error', reason: first.error }
    const failed = await finalSmoke(versionId, undefined)
    return failed ?? { kind: 'released', versionId, previous: undefined }
  }

  const shift = async (percentage: number) =>
    deps.deploy(workerName, versionSpecs(versionId, stable, percentage), message)

  // ── blue/green: 0% で並べて、新版だけを本番ドメインで確かめる ─────────
  if (params.resumeVersion === undefined) {
    const parked = await shift(0)
    if (!parked.ok) return { kind: 'error', reason: parked.error }
    if (url !== undefined) {
      const green = await deps.smoke(url, overrideHeader(workerName, versionId))
      if (!green.ok) return rollback(versionId, stable, `blue/green check failed: ${green.error}`)
    }
  }

  // ── canary ─────────────────────────────────────────────────────────
  for (const percentage of steps.filter((s) => s > startAfter && s < 100)) {
    const moved = await shift(percentage)
    if (!moved.ok) return rollback(versionId, stable, moved.error)
    deps.log(`→ ${workerName}: ${versionId} at ${percentage}%`)
    const since = deps.now()

    let extensions = 0
    let synthesized = false
    const holdForHuman = (reason: string): RolloutOutcome => ({
      kind: 'needs-human',
      reason,
      versionId,
      stable,
      percentage,
    })
    if (deps.stats === undefined) {
      return holdForHuman(
        'no analytics source can split traffic by version (GraphQL has no version dimension and Workers Logs is unavailable)',
      )
    }
    await deps.sleep(bakeMinutes * minute)
    for (;;) {
      const stats = await deps.stats(workerName, since, deps.now())
      if (!stats.ok) return holdForHuman(`analytics query failed: ${stats.error}`)
      const verdict = judgeCanary(
        stats.value.get(versionId) ?? empty,
        stats.value.get(stable) ?? empty,
        { minSamples: params.minSamples },
      )
      if (verdict.kind === 'pass') {
        deps.log(`✓ ${workerName} ${percentage}%: error rate ${verdict.newRate} ≤ ${verdict.limit}`)
        break
      }
      if (verdict.kind === 'fail') {
        return rollback(
          versionId,
          stable,
          `error rate ${verdict.newRate.toFixed(4)} > ${verdict.limit.toFixed(4)} at ${percentage}%`,
        )
      }
      // 判定不能: public なら override 付きの synthetic で補う → それでも足りなければ延長
      if (url !== undefined && !synthesized) {
        synthesized = true
        const count = Math.min(verdict.needed - verdict.requests, maxSynthetic)
        await deps.synthetic(url, overrideHeader(workerName, versionId), count)
        await deps.sleep(analyticsLag)
        continue
      }
      if (extensions >= params.maxExtensions) {
        return holdForHuman(
          `only ${verdict.requests}/${verdict.needed} requests reached ${versionId} at ${percentage}%`,
        )
      }
      extensions += 1
      deps.log(
        `… ${workerName}: not enough traffic, extending bake (${extensions}/${params.maxExtensions})`,
      )
      await deps.sleep(Math.max(bakeMinutes, 1) * minute)
    }
  }

  // ── 100% ───────────────────────────────────────────────────────────
  const full = await shift(100)
  if (!full.ok) return rollback(versionId, stable, full.error)
  const failed = await finalSmoke(versionId, stable)
  return failed ?? { kind: 'released', versionId, previous: stable }
}
