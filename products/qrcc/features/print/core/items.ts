/**
 * 入力欄のテキストを、印刷するコードの一覧に読み替える。
 *
 * 保存済みのコード（`features/manage`）が入るまでの入口であり、
 * 表計算から貼り付けた「名前<TAB>内容」をそのまま受け取れる形にしてある。
 */
import type { PrintItem } from '../contract/index.ts'

/**
 * 1 行 1 コード。行の最初のタブより前が名前、後ろが内容。
 * タブが無い行は名前を空にする（キャプションは内容で代用される）。
 *
 * @param copies すべての行に共通の枚数。行ごとの枚数指定は要件に無いので持たない
 */
export const parseItemLines = (text: string, copies: number): readonly PrintItem[] =>
  text.split('\n').flatMap((line) => {
    const separator = line.indexOf('\t')
    const name = separator === -1 ? '' : line.slice(0, separator).trim()
    const content = (separator === -1 ? line : line.slice(separator + 1)).trim()
    // 内容が無い行は刷るものが無いので落とす（空のラベルを作らない）
    return content === '' ? [] : [{ name, content, copies }]
  })
