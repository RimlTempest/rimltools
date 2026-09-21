import { bucketOf } from './hash.ts'
import type {
  Condition,
  ContextValue,
  Evaluation,
  EvaluationContext,
  FlagDefinition,
  Reason,
  Result,
} from './types.ts'

const matches = (condition: Condition, actual: ContextValue | undefined): boolean => {
  if (actual === undefined || Array.isArray(actual)) return false
  switch (condition.op) {
    case 'eq':
      return actual === condition.value
    case 'in':
      return typeof actual !== 'boolean' && condition.value.includes(actual)
    case 'startsWith':
      return typeof actual === 'string' && actual.startsWith(condition.value)
  }
}

const serve = (
  flag: FlagDefinition,
  variant: string,
  reason: Reason,
): Result<Evaluation, string> => {
  const value = flag.variants[variant]
  if (value === undefined) {
    return { ok: false, error: `${flag.key}: variant "${variant}" is not defined` }
  }
  return { ok: true, value: { value, variant, reason } }
}

/** 重み付きの振り分け。重みは合計 100（parse で保証）。 */
const pickWeighted = (distribution: Record<string, number>, bucket: number): string | undefined => {
  let upper = 0
  for (const [variant, weight] of Object.entries(distribution)) {
    upper += weight * 100
    if (bucket < upper) return variant
  }
  return undefined
}

/**
 * 1 つの flag を評価する純関数。順序は
 * enabled → rules（最初に一致したもの）→ rollout → distribution → defaultVariant。
 */
export const evaluateFlag = (
  flag: FlagDefinition,
  context: EvaluationContext,
): Result<Evaluation, string> => {
  if (!flag.enabled) return serve(flag, flag.defaultVariant, 'DISABLED')

  for (const rule of flag.rules) {
    if (rule.when.every((c) => matches(c, context[c.attribute]))) {
      return serve(flag, rule.variant, 'TARGETING_MATCH')
    }
  }

  const splits = flag.rollout !== undefined || flag.distribution !== undefined
  if (!splits) {
    return serve(flag, flag.defaultVariant, flag.rules.length === 0 ? 'STATIC' : 'DEFAULT')
  }

  const subject = context.targetingKey
  if (subject === undefined || subject === '') {
    return serve(flag, flag.defaultVariant, 'DEFAULT')
  }

  // rollout と distribution で別のバケットを使う。同じにすると、rollout 10% の
  // 対象者が distribution の先頭 variant に偏る。
  if (flag.rollout !== undefined) {
    const inside = bucketOf(`${flag.key}:rollout`, subject) < flag.rollout.percentage * 100
    if (!inside) return serve(flag, flag.defaultVariant, 'DEFAULT')
    if (flag.rollout.variant !== undefined) return serve(flag, flag.rollout.variant, 'SPLIT')
  }

  if (flag.distribution !== undefined) {
    const variant = pickWeighted(flag.distribution, bucketOf(flag.key, subject))
    if (variant !== undefined) return serve(flag, variant, 'SPLIT')
  }

  return serve(flag, flag.defaultVariant, 'DEFAULT')
}
