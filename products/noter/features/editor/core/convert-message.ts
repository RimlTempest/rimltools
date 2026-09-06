/**
 * 変換できなかった理由を、次にできることまで含めて言う（`docs/design/ux.md` §8）。
 *
 * `ConvertError` は型だけを借りる（実装は import しない）ので、この関数は
 * 純粋なまま。変換先の呼び名は画面の言葉なので引数で受け取る。
 */
import type { ConvertError } from '@noter/formats/core'

export const describeConvertError = (error: ConvertError, targetLabel: string): string => {
  switch (error.reason) {
    case 'parse':
      return '変換できません。いまの本文に構文エラーがあります。問題を開いて、指摘された行を直してください。'
    case 'not_object':
      return `${targetLabel} にできません。いちばん外側がキーと値の集まりである必要があります。`
    case 'null_value':
      return `${targetLabel} にできません。${error.path} の値が空です。値を入れるか、その項目を消してください。`
    case 'stringify':
      return `${targetLabel} にできません。この形式で表せない値が含まれています。`
  }
}
