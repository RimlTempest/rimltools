/* eslint-disable no-await-in-loop -- 段階リリースは前の段の結果を見てから次へ進むのが仕様 */
/**
 * リリースのエントリポイント（ADR-0002 / ADR-0003）。workflow から呼ぶ:
 *
 *   bun scripts/release/release.ts changed                    # 出すべきツール（GITHUB_OUTPUT: tools）
 *   bun scripts/release/release.ts prepare  --tool qrcc       # wrangler.json を環境向けに書き換える
 *   bun scripts/release/release.ts migrate  --tool qrcc       # D1 migration（expand）を適用
 *   bun scripts/release/release.ts rollout  --tool qrcc       # upload → 0% 検証 → canary → 100%
 *   bun scripts/release/release.ts preview  --tool qrcc --alias pr-12
 *   bun scripts/release/release.ts promote  --tool qrcc --version <id> [--worker <name>]
 *   bun scripts/release/release.ts rollback --tool qrcc [--worker <name>] [--version <id>]
 *   bun scripts/release/release.ts resume   --tool qrcc --worker <name> --version <id>
 *   bun scripts/release/release.ts check-migrations          # PR の migration guard
 *   bun scripts/release/release.ts guard                     # main / develop 宛て PR の出入口
 *
 * 環境の値は GitHub environment（Terraform が設定）から環境変数で受け取る。
 * 終了コード: 0 = 成功 / 1 = 失敗（ロールバック済みを含む）/ 3 = 人の判断待ち
 */
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createCloudflare } from '../lib/cloudflare.ts'
import { changedFiles, commitTitles } from '../lib/git.ts'
import type { Registry, Result, Tool } from '../lib/tools.ts'
import { findTool, loadTools } from '../lib/tools.ts'
import { invocationsQuery, parseInvocations } from './analysis.ts'
import type { Args } from './args.ts'
import { parseArgs } from './args.ts'
import { changedTools } from './changes.ts'
import { currentStable, parseDeployments, parseWranglerOutput } from './deployments.ts'
import type { DeployEnv } from './environment.ts'
import { accessHeaders, mergeVariables, readEnvironment } from './environment.ts'
import { checkReleaseGuard } from './guard.ts'
import { checkMigrations } from './migrations.ts'
import type { WorkerPlan } from './plan.ts'
import { planRollout } from './plan.ts'
import type { PreparedConfig } from './prepare.ts'
import { migrationConfigFor, preparedPath } from './prepare.ts'
import { rewriteConfig } from './rewrite.ts'
import type { RolloutDeps, RolloutOutcome } from './rollout.ts'
import { rolloutWorker } from './rollout.ts'
import { runSmoke } from './smoke.ts'

const EXIT_FAILED = 1
const EXIT_NEEDS_HUMAN = 3

const env = mergeVariables(process.env['RELEASE_VARS'], process.env)
const access = accessHeaders(env)

const say = (message: string) => console.log(message)

const setOutput = async (key: string, value: string) => {
  const file = env['GITHUB_OUTPUT']
  if (file === undefined) return say(`${key}=${value}`)
  await Bun.write(
    file,
    `${await Bun.file(file)
      .text()
      .catch(() => '')}${key}=${value}\n`,
  )
}

const summary = async (markdown: string) => {
  const file = env['GITHUB_STEP_SUMMARY']
  if (file === undefined) return say(markdown)
  await Bun.write(
    file,
    `${await Bun.file(file)
      .text()
      .catch(() => '')}${markdown}\n`,
  )
}

const fail = (message: string, code = EXIT_FAILED): number => {
  console.error(`::error::${message.replaceAll('\n', '%0A')}`)
  return code
}

// ── wrangler ──────────────────────────────────────────────────────────

type WranglerRun = { code: number; stderr: string; output: string }

const wrangler = async (args: string[], deployEnv: DeployEnv): Promise<WranglerRun> => {
  const outFile = join(tmpdir(), `wrangler-${crypto.randomUUID()}.ndjson`)
  const proc = Bun.spawn(['bunx', 'wrangler', ...args], {
    stdout: 'inherit',
    stderr: 'pipe',
    env: {
      ...env,
      CLOUDFLARE_API_TOKEN: deployEnv.apiToken,
      CLOUDFLARE_ACCOUNT_ID: deployEnv.accountId,
      WRANGLER_OUTPUT_FILE_PATH: outFile,
      WRANGLER_SEND_METRICS: 'false',
    },
  })
  const [stderr, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited])
  process.stderr.write(stderr)
  const output = await Bun.file(outFile)
    .text()
    .catch(() => '')
  return { code, stderr, output }
}

const wranglerResult = (run: WranglerRun, what: string): Result<undefined, string> =>
  run.code === 0
    ? { ok: true, value: undefined }
    : { ok: false, error: `${what} failed (exit ${run.code}): ${run.stderr.trim().slice(-500)}` }

// ── 設定の読み書き ────────────────────────────────────────────────────

const hostFor = (tool: Tool, deployEnv: DeployEnv): string =>
  deployEnv.name === 'production' ? tool.host : tool.stagingHost

const loadPrepared = async (
  tool: Tool,
  deployEnv: DeployEnv,
): Promise<Result<PreparedConfig[], string>> => {
  const out: PreparedConfig[] = []
  for (const worker of tool.workers) {
    const path = preparedPath(tool.path, worker.buildConfig, deployEnv.name)
    const file = Bun.file(path)
    if (!(await file.exists())) return { ok: false, error: `${path} not found. Run prepare first.` }
    const json: unknown = await file.json()
    if (typeof json !== 'object' || json === null || Array.isArray(json)) {
      return { ok: false, error: `${path} is not an object` }
    }
    out.push({ worker: worker.name, path, json: Object.fromEntries(Object.entries(json)) })
  }
  return { ok: true, value: out }
}

const statePath = (tool: Tool, deployEnv: DeployEnv) =>
  join('.release', `${tool.name}.${deployEnv.name}.json`)

type WorkerState = { worker: string; versionId: string | undefined; previous: string | undefined }

const writeState = async (tool: Tool, deployEnv: DeployEnv, state: WorkerState[]) => {
  await mkdir('.release', { recursive: true })
  await Bun.write(statePath(tool, deployEnv), `${JSON.stringify(state, null, 2)}\n`)
}

const optionalString = (v: unknown) => (typeof v === 'string' ? v : undefined)

const readState = async (tool: Tool, deployEnv: DeployEnv): Promise<WorkerState[]> => {
  const file = Bun.file(statePath(tool, deployEnv))
  if (!(await file.exists())) return []
  const raw: unknown = await file.json()
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item: unknown) => {
    if (typeof item !== 'object' || item === null) return []
    const entry = Object.fromEntries(Object.entries(item))
    const worker = entry['worker']
    if (typeof worker !== 'string') return []
    return [
      {
        worker,
        versionId: optionalString(entry['versionId']),
        previous: optionalString(entry['previous']),
      },
    ]
  })
}

// ── 依存の組み立て（composition root）──────────────────────────────────

const makeDeps = (deployEnv: DeployEnv): RolloutDeps => {
  const cf = createCloudflare({
    apiToken: deployEnv.apiToken,
    fetch: (input, init) => fetch(input, init),
  })
  return {
    log: say,
    upload: async (configPath, meta) => {
      const run = await wrangler(
        ['versions', 'upload', '-c', configPath, '--message', meta.message, '--tag', meta.tag],
        deployEnv,
      )
      const ok = wranglerResult(run, 'versions upload')
      if (!ok.ok) return ok
      const entry = parseWranglerOutput(run.output, 'version-upload')
      if (!entry.ok) return entry
      const versionId = entry.value['version_id']
      const preview = entry.value['preview_url']
      if (typeof versionId !== 'string')
        return { ok: false, error: 'versions upload: no version_id' }
      return {
        ok: true,
        value: { versionId, previewUrl: typeof preview === 'string' ? preview : undefined },
      }
    },
    deploy: async (workerName, specs, message) =>
      wranglerResult(
        await wrangler(
          ['versions', 'deploy', ...specs, '--name', workerName, '--message', message, '--yes'],
          deployEnv,
        ),
        `versions deploy ${specs.join(' ')}`,
      ),
    deployDirect: async (configPath, message) => {
      const run = await wrangler(['deploy', '-c', configPath, '--message', message], deployEnv)
      const ok = wranglerResult(run, 'deploy')
      if (!ok.ok) return ok
      const entry = parseWranglerOutput(run.output, 'deploy')
      if (!entry.ok) return entry
      const versionId = entry.value['version_id']
      return typeof versionId === 'string'
        ? { ok: true, value: { versionId } }
        : { ok: false, error: 'deploy: no version_id' }
    },
    deployments: async (workerName) => {
      const res = await cf.rest(
        'GET',
        `/accounts/${deployEnv.accountId}/workers/scripts/${workerName}/deployments`,
      )
      // Terraform が枠だけ作った Worker、または初回は 404 / 空
      if (!res.ok) return res.error.includes(': 404 ') ? { ok: true, value: [] } : res
      return parseDeployments(res.value)
    },
    stats: async (workerName, since, until) => {
      const res = await cf.graphql(invocationsQuery, {
        accountTag: deployEnv.accountId,
        scriptName: workerName,
        since: since.toISOString(),
        until: until.toISOString(),
      })
      return res.ok ? parseInvocations(res.value) : res
    },
    smoke: async (url, headers) => {
      // デプロイ直後は配信の切替に揺らぎがあるので、20 秒間隔で最大 6 回まで再試行する
      let last: Result<{ assets: number }, string> = { ok: false, error: 'not run' }
      for (let attempt = 1; attempt <= 6; attempt += 1) {
        last = await runSmoke(url, headers, async (u, init) => {
          const res = await fetch(u, {
            headers: { 'user-agent': 'rimltools-release', ...access, ...init.headers },
          })
          return { status: res.status, text: () => res.text() }
        })
        if (last.ok) return last
        say(`smoke ${attempt}/6 failed: ${last.error}`)
        if (attempt < 6) await Bun.sleep(20_000)
      }
      return last
    },
    synthetic: async (url, headers, count) => {
      say(`synthetic: ${count} requests to ${url}`)
      const one = async () => {
        try {
          const res = await fetch(url, {
            headers: { 'user-agent': 'rimltools-release-synthetic', ...access, ...headers },
          })
          await res.arrayBuffer()
        } catch {
          // synthetic は数合わせなので、個々の失敗は canary の判定側に任せる
        }
      }
      for (let sent = 0; sent < count; sent += 10) {
        await Promise.all(Array.from({ length: Math.min(10, count - sent) }, one))
      }
    },
    sleep: (ms) => Bun.sleep(ms),
    now: () => new Date(),
  }
}

// ── ステップ ─────────────────────────────────────────────────────────

const stepChanged = async (registry: Registry): Promise<number> => {
  const base = env['RELEASE_BASE'] ?? ''
  const head = env['RELEASE_HEAD'] ?? 'HEAD'
  let tools: string[]
  if (base === '' || /^0+$/.test(base)) {
    tools = registry.tools.map((t) => t.name)
  } else {
    const files = await changedFiles(base, head)
    if (!files.ok) return fail(files.error)
    tools = changedTools(files.value, registry.tools)
  }
  say(`tools to release: ${tools.join(', ') || '(none)'}`)
  await setOutput('tools', JSON.stringify(tools))
  return 0
}

const stepCheckMigrations = async (): Promise<number> => {
  const base = env['GUARD_BASE'] ?? 'develop'
  const files = await changedFiles(`origin/${base}`, 'HEAD')
  if (!files.ok) return fail(files.error)
  const sql = files.value.filter((f) => /\/migrations\/[^/]+\.sql$/.test(f))
  const contents = await Promise.all(
    sql.map(async (path) => {
      const file = Bun.file(path)
      return (await file.exists()) ? [{ path, content: await file.text() }] : []
    }),
  )
  const violations = checkMigrations(contents.flat())
  for (const v of violations) {
    console.error(
      `::error file=${v.path}::"${v.statement}" is a contract change. Ship the expand step first and start this file with "-- contract: <why it is safe now>" (docs/release.md).`,
    )
  }
  say(`checked ${sql.length} migration file(s)`)
  return violations.length === 0 ? 0 : EXIT_FAILED
}

const stepGuard = async (): Promise<number> => {
  const base = env['GUARD_BASE'] ?? ''
  const head = env['GUARD_HEAD'] ?? ''
  const labelsRaw: unknown = JSON.parse(env['GUARD_LABELS'] ?? '[]')
  const labels = Array.isArray(labelsRaw)
    ? labelsRaw.filter((l): l is string => typeof l === 'string')
    : []
  const titles = await commitTitles(`origin/${base}`, 'HEAD')
  if (!titles.ok) return fail(titles.error)
  const problems = checkReleaseGuard({ base, head, labels, titles: titles.value })
  for (const p of problems) console.error(`::error::${p}`)
  if (problems.length === 0) say(`${head} → ${base}: ok`)
  return problems.length === 0 ? 0 : EXIT_FAILED
}

const stepPrepare = async (tool: Tool, deployEnv: DeployEnv): Promise<number> => {
  for (const worker of tool.workers) {
    const source = join(tool.path, worker.buildConfig)
    const file = Bun.file(source)
    if (!(await file.exists())) return fail(`${source} not found. Build ${tool.name} first.`)
    const rewritten = rewriteConfig(await file.json(), {
      tool,
      env: deployEnv,
      host: hostFor(tool, deployEnv),
    })
    if (!rewritten.ok) return fail(rewritten.error)
    const target = preparedPath(tool.path, worker.buildConfig, deployEnv.name)
    await Bun.write(target, `${JSON.stringify(rewritten.value, null, 2)}\n`)
    say(`prepared ${target} (${String(rewritten.value['name'])})`)
  }
  return 0
}

const stepMigrate = async (tool: Tool, deployEnv: DeployEnv, dryRun: boolean): Promise<number> => {
  const prepared = await loadPrepared(tool, deployEnv)
  if (!prepared.ok) return fail(prepared.error)
  for (const d1 of tool.d1) {
    const config = migrationConfigFor(tool, d1, prepared.value)
    if (!config.ok) return fail(config.error)
    const args = [
      'd1',
      'migrations',
      'apply',
      `${d1.name}${deployEnv.suffix}`,
      '--remote',
      '-c',
      config.value,
    ]
    if (dryRun) {
      say(`[dry-run] wrangler ${args.join(' ')}`)
      continue
    }
    const run = wranglerResult(await wrangler(args, deployEnv), `migrations for ${d1.name}`)
    if (!run.ok) return fail(run.error)
  }
  return 0
}

const report = async (
  tool: Tool,
  deployEnv: DeployEnv,
  results: { plan: WorkerPlan; outcome: RolloutOutcome }[],
) => {
  const rows = results.map(({ plan, outcome }) => {
    const version = 'versionId' in outcome ? (outcome.versionId ?? '-') : '-'
    const detail = 'reason' in outcome ? outcome.reason : ''
    return `| ${plan.worker.name}${deployEnv.suffix} | ${plan.strategy.kind} | ${outcome.kind} | \`${version}\` | ${detail} |`
  })
  await summary(
    [
      `### ${tool.name} → ${deployEnv.name}`,
      '',
      '| Worker | 方式 | 結果 | 版 | 詳細 |',
      '| --- | --- | --- | --- | --- |',
      ...rows,
      '',
    ].join('\n'),
  )
}

const runPlans = async (
  tool: Tool,
  deployEnv: DeployEnv,
  plans: WorkerPlan[],
  resume: { worker: string; version: string } | undefined,
): Promise<number> => {
  const prepared = await loadPrepared(tool, deployEnv)
  if (!prepared.ok) return fail(prepared.error)
  const deps = makeDeps(deployEnv)
  const state = await readState(tool, deployEnv)
  const results: { plan: WorkerPlan; outcome: RolloutOutcome }[] = []

  for (const plan of plans) {
    const config = prepared.value.find((c) => c.worker === plan.worker.name)
    if (config === undefined) return fail(`no prepared config for ${plan.worker.name}`)
    const workerName = `${plan.worker.name}${deployEnv.suffix}`
    say(`\n== ${workerName} (${plan.strategy.kind}) ==`)
    const outcome = await rolloutWorker(deps, {
      workerName,
      configPath: config.path,
      url: plan.worker.role === 'public' ? `https://${hostFor(tool, deployEnv)}/` : undefined,
      strategy: plan.strategy,
      commit: env['GITHUB_SHA'] ?? 'local',
      runId: env['GITHUB_RUN_ID'] ?? 'local',
      minSamples: Number(env['RELEASE_MIN_SAMPLES'] ?? 200),
      maxExtensions: Number(env['RELEASE_MAX_EXTENSIONS'] ?? 3),
      ...(resume !== undefined && resume.worker === plan.worker.name
        ? { resumeVersion: resume.version }
        : {}),
    })
    results.push({ plan, outcome })
    if (outcome.kind === 'released' || outcome.kind === 'rolled-back') {
      state.push({
        worker: plan.worker.name,
        versionId: outcome.versionId,
        previous: outcome.previous,
      })
      await writeState(tool, deployEnv, state)
    }
    if (outcome.kind !== 'released') break
  }

  await report(tool, deployEnv, results)
  const last = results.at(-1)?.outcome
  if (last === undefined) return 0
  if (last.kind === 'needs-human') {
    await setOutput('needs_human', 'true')
    return fail(
      `${last.reason}. Traffic stays split (${last.versionId} at ${last.percentage}%). `
        + 'Run "Deploy production" manually with action=resume, promote or rollback (docs/runbooks/rollback.md).',
      EXIT_NEEDS_HUMAN,
    )
  }
  if (last.kind === 'rolled-back') return fail(`${tool.name}: rolled back — ${last.reason}`)
  if (last.kind === 'error') return fail(`${tool.name}: ${last.reason}`)
  return 0
}

const stepRollout = async (tool: Tool, deployEnv: DeployEnv, dryRun: boolean): Promise<number> => {
  const plans = planRollout(tool, deployEnv.name)
  for (const p of plans)
    say(`plan: ${p.worker.name}${deployEnv.suffix} → ${JSON.stringify(p.strategy)}`)
  if (dryRun) return 0
  return runPlans(tool, deployEnv, plans, undefined)
}

const stepResume = async (tool: Tool, deployEnv: DeployEnv, args: Args): Promise<number> => {
  if (args.worker === undefined || args.version === undefined)
    return fail('resume needs --worker and --version')
  const plans = planRollout(tool, deployEnv.name)
  const index = plans.findIndex((p) => p.worker.name === args.worker)
  if (index < 0) return fail(`${tool.name} has no worker ${args.worker}`)
  return runPlans(tool, deployEnv, plans.slice(index), {
    worker: args.worker,
    version: args.version,
  })
}

const workersFor = (tool: Tool, worker: string | undefined) =>
  worker === undefined ? tool.workers : tool.workers.filter((w) => w.name === worker)

const stepPromote = async (tool: Tool, deployEnv: DeployEnv, args: Args): Promise<number> => {
  if (args.version === undefined) return fail('promote needs --version')
  const target = args.worker ?? tool.workers.find((w) => w.role === 'public')?.name
  if (target === undefined) return fail(`${tool.name} has no public worker`)
  const deps = makeDeps(deployEnv)
  const res = await deps.deploy(
    `${target}${deployEnv.suffix}`,
    [`${args.version}@100%`],
    `promote ${args.version}`,
  )
  if (!res.ok) return fail(res.error)
  const url = `https://${hostFor(tool, deployEnv)}/`
  const smoke = await deps.smoke(url, {})
  return smoke.ok ? 0 : fail(`promoted, but smoke failed: ${smoke.error}. Consider rollback.`)
}

const stepRollback = async (tool: Tool, deployEnv: DeployEnv, args: Args): Promise<number> => {
  const deps = makeDeps(deployEnv)
  const state = await readState(tool, deployEnv)
  // 上流（public）から戻す。下流を先に戻すと、新しい上流が古い下流を呼ぶ時間ができる
  const targets = [...workersFor(tool, args.worker)].toSorted((a, b) =>
    a.role === b.role ? 0 : a.role === 'public' ? -1 : 1,
  )
  for (const worker of targets) {
    const name = `${worker.name}${deployEnv.suffix}`
    let version = args.version ?? state.find((s) => s.worker === worker.name)?.previous
    if (version === undefined) {
      const history = await deps.deployments(name)
      if (!history.ok) return fail(history.error)
      const current = history.value[0]?.versions.toSorted((a, b) => b.percentage - a.percentage)[0]
      version = current === undefined ? undefined : currentStable(history.value, current.versionId)
    }
    if (version === undefined) {
      say(`${name}: nothing to roll back to`)
      continue
    }
    say(`↩ ${name} → ${version}`)
    const res = await deps.deploy(name, [`${version}@100%`], 'manual rollback')
    if (!res.ok) return fail(res.error)
  }
  return 0
}

const stepPreview = async (tool: Tool, deployEnv: DeployEnv, args: Args): Promise<number> => {
  if (args.alias === undefined) return fail('preview needs --alias')
  const worker = tool.workers.find((w) => w.role === 'public')
  if (worker === undefined) return fail(`${tool.name} has no public worker`)
  const config = preparedPath(tool.path, worker.buildConfig, deployEnv.name)
  const run = await wrangler(
    [
      'versions',
      'upload',
      '-c',
      config,
      '--preview-alias',
      args.alias,
      '--message',
      `preview ${args.alias}`,
    ],
    deployEnv,
  )
  const ok = wranglerResult(run, 'preview upload')
  if (!ok.ok) return fail(ok.error)
  const entry = parseWranglerOutput(run.output, 'version-upload')
  if (!entry.ok) return fail(entry.error)
  const url = entry.value['preview_alias_url'] ?? entry.value['preview_url']
  await setOutput('url', typeof url === 'string' ? url : '')
  return 0
}

// ── main ─────────────────────────────────────────────────────────────

const main = async (): Promise<number> => {
  const args = parseArgs(process.argv.slice(2))
  if (!args.ok) return fail(args.error)
  const registry = await loadTools()
  if (!registry.ok) return fail(registry.error)

  const { step } = args.value
  if (step === 'changed') return stepChanged(registry.value)
  if (step === 'check-migrations') return stepCheckMigrations()
  if (step === 'guard') return stepGuard()

  const tool = findTool(registry.value, args.value.tool ?? '')
  if (!tool.ok) return fail(tool.error)
  const deployEnv = readEnvironment(env)
  if (!deployEnv.ok) return fail(deployEnv.error)

  switch (step) {
    case 'prepare':
      return stepPrepare(tool.value, deployEnv.value)
    case 'migrate':
      return stepMigrate(tool.value, deployEnv.value, args.value.dryRun)
    case 'rollout':
      return stepRollout(tool.value, deployEnv.value, args.value.dryRun)
    case 'resume':
      return stepResume(tool.value, deployEnv.value, args.value)
    case 'promote':
      return stepPromote(tool.value, deployEnv.value, args.value)
    case 'rollback':
      return stepRollback(tool.value, deployEnv.value, args.value)
    case 'preview':
      return stepPreview(tool.value, deployEnv.value, args.value)
  }
}

process.exitCode = await main()
