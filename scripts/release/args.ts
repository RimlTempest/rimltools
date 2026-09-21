import type { Result } from '../lib/tools.ts'

export const toolSteps = [
  'prepare',
  'migrate',
  'rollout',
  'preview',
  'promote',
  'rollback',
  'resume',
] as const
export const globalSteps = ['changed', 'check-migrations', 'guard'] as const

export type ToolStep = (typeof toolSteps)[number]
export type GlobalStep = (typeof globalSteps)[number]

export type Args = {
  step: ToolStep | GlobalStep
  tool: string | undefined
  dryRun: boolean
  version: string | undefined
  worker: string | undefined
  alias: string | undefined
}

const isToolStep = (s: string): s is ToolStep => toolSteps.some((t) => t === s)
const isGlobalStep = (s: string): s is GlobalStep => globalSteps.some((t) => t === s)

export const parseArgs = (argv: string[]): Result<Args, string> => {
  const [step, ...rest] = argv
  if (step === undefined || (!isToolStep(step) && !isGlobalStep(step))) {
    return {
      ok: false,
      error: `usage: release.ts <${[...toolSteps, ...globalSteps].join('|')}> [--tool <name>]`,
    }
  }
  const values: Record<string, string | undefined> = {}
  let dryRun = false
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i]
    if (flag === '--dry-run') {
      dryRun = true
      continue
    }
    if (flag === '--tool' || flag === '--version' || flag === '--worker' || flag === '--alias') {
      const value = rest[i + 1]
      if (value === undefined || value.startsWith('--'))
        return { ok: false, error: `${flag} needs a value` }
      values[flag.slice(2)] = value
      i += 1
      continue
    }
    return { ok: false, error: `unknown option: ${String(flag)}` }
  }
  if (isToolStep(step) && values['tool'] === undefined) {
    return { ok: false, error: `${step} needs --tool <name>` }
  }
  return {
    ok: true,
    value: {
      step,
      tool: values['tool'],
      dryRun,
      version: values['version'],
      worker: values['worker'],
      alias: values['alias'],
    },
  }
}
