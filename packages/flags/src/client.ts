import { evaluateFlag } from './core/evaluate.ts'
import type {
  EvaluationContext,
  FlagDefinition,
  FlagValue,
  JsonValue,
  Reason,
} from './core/types.ts'
import type { FlagLog, FlagStore } from './store.ts'

/** OpenFeature の ErrorCode と同じ文字列 */
export type FlagErrorCode = 'FLAG_NOT_FOUND' | 'TYPE_MISMATCH' | 'PARSE_ERROR' | 'GENERAL'

export type FlagResult<T> =
  | { value: T; variant: string; reason: Reason }
  | { value: T; reason: 'ERROR'; errorCode: FlagErrorCode }

/**
 * 露出ログを出す範囲。既定は A/B（`experiment` のある flag）だけ。
 * Workers Logs は Free で 20 万件/日なので、全評価を出すのは調査時だけにする。
 */
export type ExposureMode = 'experiments' | 'all' | 'none'

export type FlagClientOptions = {
  store: FlagStore
  tool: string
  log: FlagLog
  exposure?: ExposureMode
}

type Evaluate<T> = (
  flagKey: string,
  defaultValue: T,
  context?: EvaluationContext,
) => Promise<FlagResult<T>>

/** OpenFeature の client と同じく、値の型ごとにメソッドを分ける（リテラル型に推論させない） */
export type FlagClient = {
  boolean: Evaluate<boolean>
  string: Evaluate<string>
  number: Evaluate<number>
  object: Evaluate<{ [key: string]: JsonValue }>
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** 返す値が、呼び出し側の既定値と同じ種類か（同じ型として返してよいか） */
export const sameKind = <T extends FlagValue>(fallback: T, value: FlagValue): value is T =>
  isObject(fallback) ? isObject(value) : typeof value === typeof fallback

const error = <T>(value: T, errorCode: FlagErrorCode): FlagResult<T> => ({
  value,
  reason: 'ERROR',
  errorCode,
})

const shouldLog = (mode: ExposureMode, flag: FlagDefinition): boolean =>
  mode === 'all' || (mode === 'experiments' && flag.experiment !== undefined)

/** flag を評価するクライアント。失敗しても例外は投げず、呼び出し側の既定値を返す。 */
export const createFlagClient = (options: FlagClientOptions): FlagClient => {
  const { store, tool, log, exposure = 'experiments' } = options
  const evaluate = async <T extends FlagValue>(
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext = {},
  ): Promise<FlagResult<T>> => {
    const flags = await store.load()
    if (!flags.ok) {
      log({ event: 'flag_store_error', tool, flag: flagKey, error: flags.error })
      return error(defaultValue, 'GENERAL')
    }
    const flag = flags.value.get(flagKey)
    if (flag === undefined) return error(defaultValue, 'FLAG_NOT_FOUND')

    const result = evaluateFlag(flag, context)
    if (!result.ok) {
      log({ event: 'flag_invalid', tool, flag: flagKey, errors: [result.error] })
      return error(defaultValue, 'PARSE_ERROR')
    }
    const { value, variant, reason } = result.value
    if (!sameKind(defaultValue, value)) return error(defaultValue, 'TYPE_MISMATCH')

    if (shouldLog(exposure, flag)) {
      log({
        event: 'flag_exposure',
        tool,
        flag: flagKey,
        variant,
        ...(flag.experiment === undefined ? {} : { experiment: flag.experiment }),
      })
    }
    return { value, variant, reason }
  }
  return {
    boolean: evaluate,
    string: evaluate,
    number: evaluate,
    object: evaluate,
  }
}
