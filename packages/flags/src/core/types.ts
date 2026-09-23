/**
 * feature flag の定義（正本は `flags/<tool>.json`、実行時は D1 の `feature_flags`）。
 * ADR-0004。評価は evaluate.ts の純関数だけが行う。
 */

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }

export type FlagType = 'boolean' | 'string' | 'number' | 'object'

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

export type FlagValue = boolean | string | number | { [key: string]: JsonValue }

export type Operator = 'eq' | 'in' | 'startsWith'

export type Condition =
  | { attribute: string; op: 'eq'; value: string | number | boolean }
  | { attribute: string; op: 'in'; value: (string | number)[] }
  | { attribute: string; op: 'startsWith'; value: string }

/** `when` の条件をすべて満たしたら `variant` を返す。上から順に評価し、最初に一致したものが勝つ。 */
export type Rule = { when: Condition[]; variant: string }

/**
 * `percentage`% の対象者だけが split に入る。
 * `variant` があればそれを、無ければ `distribution` の重みで振り分けた variant を返す。
 */
export type Rollout = { percentage: number; variant?: string }

export type FlagDefinition = {
  key: string
  description: string
  type: FlagType
  /** false のとき（kill switch）は必ず defaultVariant を返す */
  enabled: boolean
  variants: Record<string, FlagValue>
  /** 無効時・対象外・対象者 ID が無いときに返す。**安全側の値にすること** */
  defaultVariant: string
  rules: Rule[]
  rollout?: Rollout
  /** A/B テストの重み（合計 100） */
  distribution?: Record<string, number>
  /** A/B テストの識別子。露出ログに載る */
  experiment?: string
}

export type ContextValue = string | number | boolean | (string | number)[]

/** OpenFeature の EvaluationContext と同じ形。targetingKey が振り分けの対象者 ID */
export type EvaluationContext = { targetingKey?: string } & Record<string, ContextValue | undefined>

/** OpenFeature の StandardResolutionReasons の部分集合 */
export type Reason = 'DISABLED' | 'STATIC' | 'TARGETING_MATCH' | 'SPLIT' | 'DEFAULT'

export type Evaluation = { value: FlagValue; variant: string; reason: Reason }
