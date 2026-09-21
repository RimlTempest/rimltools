/**
 * flags/*.json をまとめて検証する。ファイル名 = ツール名、ツールは tools.json に存在し D1 を持つこと。
 */
import { parseFlagFile } from '../../packages/flags/src/core/parse.ts'
import type { FlagDefinition, Result } from '../../packages/flags/src/core/types.ts'
import type { Registry } from '../lib/tools.ts'

export type ValidFlagFile = { tool: string; flags: FlagDefinition[]; remove: string[] }

const KEY = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

const parseRemove = (errors: string[], file: string, raw: unknown): string[] => {
  if (typeof raw !== 'object' || raw === null || !('remove' in raw) || raw.remove === undefined) {
    return []
  }
  const { remove } = raw
  if (!Array.isArray(remove)) {
    errors.push(`${file}: remove must be an array of flag keys`)
    return []
  }
  const keys = remove.filter((k): k is string => typeof k === 'string' && KEY.test(k))
  if (keys.length !== remove.length) errors.push(`${file}: remove must contain kebab-case keys`)
  return keys
}

export const validateFlagFiles = (
  registry: Pick<Registry, 'tools'>,
  files: Record<string, unknown>,
): Result<ValidFlagFile[], string[]> => {
  const errors: string[] = []
  const valid: ValidFlagFile[] = []

  for (const [file, raw] of Object.entries(files)) {
    const parsed = parseFlagFile(raw)
    if (!parsed.ok) {
      errors.push(...parsed.error.map((e) => `${file}: ${e}`))
      continue
    }
    const { tool, flags } = parsed.value
    if (file !== `${tool}.json`) errors.push(`${file}: file name must be "${tool}.json"`)

    const entry = registry.tools.find((t) => t.name === tool)
    if (entry === undefined) errors.push(`${file}: unknown tool "${tool}" (not in tools.json)`)
    else if (entry.d1.length === 0) errors.push(`${file}: tool "${tool}" has no D1 database`)

    const remove = parseRemove(errors, file, raw)
    for (const key of remove) {
      if (flags.some((f) => f.key === key)) {
        errors.push(`${file}: "${key}" is both defined and listed in remove`)
      }
    }
    valid.push({ tool, flags, remove })
  }

  if (errors.length > 0) return { ok: false, error: errors }
  return { ok: true, value: valid }
}
