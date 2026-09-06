/**
 * 表題の正規化。`MAX_TITLE_LENGTH` は一覧のレイアウトが崩れない長さ
 * （docs/domain-model.md §上限）。
 *
 * 既定値をここで埋めない。「何も入力されなかった」ことは呼び出し側が
 * 判断する（新規作成は `DEFAULT_TITLE`、名前変更は入力し直しを促す）。
 */
import { MAX_TITLE_LENGTH, err, ok } from '@noter/contract'
import type { Result } from '@noter/contract'

/** 新規作成時の表題。UI に出る文言なので、ここを唯一の定義元にする。 */
export const DEFAULT_TITLE = '無題'

export type TitleError = 'empty' | 'too_long'

/** サロゲートペアを 2 文字と数えないよう、コードポイント単位で数える。 */
const lengthInCodePoints = (value: string): number => Array.from(value).length

export const normalizeTitle = (raw: string): Result<string, TitleError> => {
  const trimmed = raw.trim()
  if (trimmed === '') return err('empty')
  if (lengthInCodePoints(trimmed) > MAX_TITLE_LENGTH) return err('too_long')
  return ok(trimmed)
}
