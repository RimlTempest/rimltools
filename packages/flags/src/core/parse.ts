import type {
  Condition,
  FlagDefinition,
  FlagType,
  FlagValue,
  JsonValue,
  Result,
  Rollout,
  Rule,
} from './types.ts'

/**
 * 正本 JSON（flags/<tool>.json）と D1 の行を、検証済みの FlagDefinition にする。
 * エラーはすべて集めて返す（1 件ずつ直させない）。
 */

type Errors = string[]

const KEY = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
const FLAG_TYPES: readonly FlagType[] = ['boolean', 'string', 'number', 'object']

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isJson = (value: unknown): value is JsonValue => {
  if (value === null) return true
  if (typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isJson)
  if (isRecord(value)) return Object.values(value).every(isJson)
  return false
}

const isFlagType = (value: unknown): value is FlagType => FLAG_TYPES.some((t) => t === value)

const toFlagValue = (type: FlagType, value: unknown): FlagValue | undefined => {
  switch (type) {
    case 'boolean':
      return typeof value === 'boolean' ? value : undefined
    case 'string':
      return typeof value === 'string' ? value : undefined
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? value : undefined
    case 'object': {
      if (!isRecord(value)) return undefined
      const out: Record<string, JsonValue> = {}
      for (const [k, v] of Object.entries(value)) {
        if (!isJson(v)) return undefined
        out[k] = v
      }
      return out
    }
  }
}

const parseCondition = (errors: Errors, at: string, raw: unknown): Condition | undefined => {
  if (!isRecord(raw)) {
    errors.push(`${at}: expected an object`)
    return undefined
  }
  const { attribute, op, value } = raw
  if (typeof attribute !== 'string' || attribute === '') {
    errors.push(`${at}.attribute: expected a non-empty string`)
    return undefined
  }
  switch (op) {
    case 'eq':
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return { attribute, op, value }
      }
      errors.push(`${at}.value: "eq" expects a string, number or boolean`)
      return undefined
    case 'in': {
      const items = Array.isArray(value)
        ? value.filter((v): v is string | number => typeof v === 'string' || typeof v === 'number')
        : undefined
      if (items !== undefined && Array.isArray(value) && items.length === value.length) {
        return { attribute, op, value: items }
      }
      errors.push(`${at}.value: "in" expects an array of strings or numbers`)
      return undefined
    }
    case 'startsWith':
      if (typeof value === 'string') return { attribute, op, value }
      errors.push(`${at}.value: "startsWith" expects a string`)
      return undefined
    default:
      errors.push(`${at}.op: expected one of eq, in, startsWith`)
      return undefined
  }
}

const parseRules = (
  errors: Errors,
  at: string,
  raw: unknown,
  variants: Record<string, FlagValue>,
): Rule[] => {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    errors.push(`${at}.rules: expected an array`)
    return []
  }
  const rules: Rule[] = []
  raw.forEach((item, i) => {
    const path = `${at}.rules[${i}]`
    if (!isRecord(item) || !Array.isArray(item['when']) || item['when'].length === 0) {
      errors.push(`${path}: expected { when: [condition, ...], variant }`)
      return
    }
    const when = item['when']
      .map((c: unknown, j: number) => parseCondition(errors, `${path}.when[${j}]`, c))
      .filter((c): c is Condition => c !== undefined)
    const variant = item['variant']
    if (typeof variant !== 'string' || variants[variant] === undefined) {
      errors.push(`${path}.variant: must name one of the variants`)
      return
    }
    if (when.length === item['when'].length) rules.push({ when, variant })
  })
  return rules
}

const parsePercentage = (errors: Errors, at: string, value: unknown): number => {
  if (typeof value === 'number' && value >= 0 && value <= 100) return value
  errors.push(`${at}: expected a number between 0 and 100`)
  return 0
}

const parseDistribution = (
  errors: Errors,
  at: string,
  raw: unknown,
  variants: Record<string, FlagValue>,
): Record<string, number> | undefined => {
  if (raw === undefined) return undefined
  if (!isRecord(raw)) {
    errors.push(`${at}.distribution: expected an object of variant weights`)
    return undefined
  }
  const out: Record<string, number> = {}
  let sum = 0
  for (const [variant, weight] of Object.entries(raw)) {
    if (variants[variant] === undefined)
      errors.push(`${at}.distribution.${variant}: unknown variant`)
    out[variant] = parsePercentage(errors, `${at}.distribution.${variant}`, weight)
    sum += out[variant] ?? 0
  }
  if (sum !== 100) errors.push(`${at}.distribution: weights must sum to 100 (got ${sum})`)
  return out
}

const parseRollout = (
  errors: Errors,
  at: string,
  raw: unknown,
  variants: Record<string, FlagValue>,
  hasDistribution: boolean,
): Rollout | undefined => {
  if (raw === undefined) return undefined
  if (!isRecord(raw)) {
    errors.push(`${at}.rollout: expected { percentage, variant? }`)
    return undefined
  }
  const percentage = parsePercentage(errors, `${at}.rollout.percentage`, raw['percentage'])
  const variant = raw['variant']
  if (variant === undefined) {
    if (!hasDistribution) {
      errors.push(`${at}.rollout.variant: required unless a distribution is given`)
    }
    return { percentage }
  }
  if (typeof variant !== 'string' || variants[variant] === undefined) {
    errors.push(`${at}.rollout.variant: must name one of the variants`)
    return { percentage }
  }
  return { percentage, variant }
}

const parseAt = (raw: unknown, at: string): Result<FlagDefinition, Errors> => {
  const errors: Errors = []
  if (!isRecord(raw)) return { ok: false, error: [`${at}: expected an object`] }

  const key = raw['key']
  if (typeof key !== 'string' || !KEY.test(key)) {
    errors.push(`${at}.key: expected kebab-case (e.g. "new-editor")`)
  }
  const description = raw['description']
  if (typeof description !== 'string' || description === '') {
    errors.push(`${at}.description: explain what the flag controls`)
  }
  const type = raw['type']
  if (!isFlagType(type)) errors.push(`${at}.type: expected one of ${FLAG_TYPES.join(', ')}`)
  const enabled = raw['enabled']
  if (typeof enabled !== 'boolean') errors.push(`${at}.enabled: expected a boolean`)

  const variants: Record<string, FlagValue> = {}
  const rawVariants = raw['variants']
  if (!isRecord(rawVariants) || Object.keys(rawVariants).length === 0) {
    errors.push(`${at}.variants: expected at least one variant`)
  } else if (isFlagType(type)) {
    for (const [name, value] of Object.entries(rawVariants)) {
      const parsed = toFlagValue(type, value)
      if (parsed === undefined) errors.push(`${at}.variants.${name}: expected a ${type} value`)
      else variants[name] = parsed
    }
  }

  const defaultVariant = raw['defaultVariant']
  if (typeof defaultVariant !== 'string' || !(defaultVariant in variants)) {
    errors.push(`${at}.defaultVariant: must name one of the variants`)
  }

  const rules = parseRules(errors, at, raw['rules'], variants)
  const distribution = parseDistribution(errors, at, raw['distribution'], variants)
  const rollout = parseRollout(errors, at, raw['rollout'], variants, distribution !== undefined)
  const experiment = raw['experiment']
  if (experiment !== undefined && (typeof experiment !== 'string' || experiment === '')) {
    errors.push(`${at}.experiment: expected a non-empty string`)
  }

  if (
    errors.length > 0
    || typeof key !== 'string'
    || typeof description !== 'string'
    || !isFlagType(type)
    || typeof enabled !== 'boolean'
    || typeof defaultVariant !== 'string'
  ) {
    return { ok: false, error: errors }
  }

  return {
    ok: true,
    value: {
      key,
      description,
      type,
      enabled,
      variants,
      defaultVariant,
      rules,
      ...(rollout === undefined ? {} : { rollout }),
      ...(distribution === undefined ? {} : { distribution }),
      ...(typeof experiment === 'string' ? { experiment } : {}),
    },
  }
}

export const parseFlagDefinition = (raw: unknown): Result<FlagDefinition, string[]> =>
  parseAt(raw, 'flag')

export type FlagFile = { tool: string; flags: FlagDefinition[] }

/** `flags/<tool>.json` 全体を検証する */
export const parseFlagFile = (raw: unknown): Result<FlagFile, string[]> => {
  if (!isRecord(raw)) return { ok: false, error: ['expected { tool, flags: [...] }'] }
  const errors: Errors = []
  const tool = raw['tool']
  if (typeof tool !== 'string' || tool === '') errors.push('tool: expected the tool name')
  const rawFlags = raw['flags']
  if (!Array.isArray(rawFlags)) {
    errors.push('flags: expected an array')
    return { ok: false, error: errors }
  }
  const flags: FlagDefinition[] = []
  const seen = new Set<string>()
  rawFlags.forEach((item: unknown, i: number) => {
    const result = parseAt(item, `flags[${i}]`)
    if (!result.ok) {
      errors.push(...result.error)
      return
    }
    if (seen.has(result.value.key))
      errors.push(`flags[${i}].key: duplicate key "${result.value.key}"`)
    seen.add(result.value.key)
    flags.push(result.value)
  })
  if (errors.length > 0 || typeof tool !== 'string') return { ok: false, error: errors }
  return { ok: true, value: { tool, flags } }
}
