/**
 * サンプリング判定（docs/observability.md §サンプリング）。
 *
 * - head: リクエストの最初に決める。上流が sampled なら従う。それ以外は ratio の確率。
 * - tail: 応答後に決め直す。エラー（5xx / 例外）と遅いリクエストは head に関係なく送る。
 *
 * tail で拾った span は分布が偏る（遅い・壊れたものだけが増える）。レイテンシ分布を
 * span から推定するときは `sampling.reason = head | parent` の span だけを使う。
 */

export type SamplingReason = 'parent' | 'head' | 'error' | 'slow'

export type HeadDecision = { readonly sampled: boolean; readonly reason: 'parent' | 'head' }

export const headDecision = (input: {
  /** 上流の traceparent の sampled フラグ。上流が無ければ undefined */
  readonly parentSampled: boolean | undefined
  readonly ratio: number
  /** [0, 1) の乱数 */
  readonly random: number
}): HeadDecision => {
  if (input.parentSampled === true) return { sampled: true, reason: 'parent' }
  return { sampled: input.random < input.ratio, reason: 'head' }
}

export type ExportDecision =
  | { readonly export: false }
  | { readonly export: true; readonly reason: SamplingReason; readonly ratio: number | undefined }

export const exportDecision = (input: {
  readonly head: HeadDecision
  readonly status: number
  readonly error: boolean
  readonly durationMs: number
  readonly slowMs: number
  /** head の確率（`sampling.ratio` 属性に載せる。parent 由来なら不明） */
  readonly ratio?: number
}): ExportDecision => {
  if (input.error || input.status >= 500) return { export: true, reason: 'error', ratio: undefined }
  if (input.durationMs >= input.slowMs) return { export: true, reason: 'slow', ratio: undefined }
  if (input.head.sampled) {
    return {
      export: true,
      reason: input.head.reason,
      ratio: input.head.reason === 'head' ? input.ratio : undefined,
    }
  }
  return { export: false }
}
