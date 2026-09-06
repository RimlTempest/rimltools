/**
 * 整形の結果を読み上げる文言。
 *
 * `docs/design/ux.md` §8 のとおり、失敗は「何が起きたか」で終わらせず
 * 「次にできること」まで言う。
 */
import type { FormatOutcome } from '../contract/format-outcome.ts'

export const formatMessage = (kind: FormatOutcome['kind']): string => {
  switch (kind) {
    case 'formatted':
      return '整形しました。'
    case 'unchanged':
      return 'すでに整形されています。'
    case 'failed':
      return '整形できません。問題を開いて、指摘された行を直してください。'
  }
}
