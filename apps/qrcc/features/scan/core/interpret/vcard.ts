/**
 * `BEGIN:VCARD` で始まる読み取り内容を解釈する（vCard 3.0/4.0 の一部だけ）。
 *
 * 出すのは氏名・電話・メール・組織（MECARD と同じ表示形にそろえる）。
 * 氏名は `FN`（表示名）を優先し、無ければ `N`（姓;名;…）から組み立てる。
 */
import type { Interpretation } from '../../contract/interpretation.ts'
import { parseLines } from './lines.ts'

const PREFIX = 'BEGIN:VCARD'

/** `N` は `姓;名;その他;敬称;敬称(後置)`。空でない部分をつなげるだけにする。 */
const nameFromN = (rawN: string): string =>
  rawN
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(' ')

export const interpretVcard = (text: string): Interpretation | undefined => {
  if (!text.trim().toUpperCase().startsWith(PREFIX)) return undefined

  const fields = parseLines(text)
  const fn = fields.get('FN')
  const n = fields.get('N')
  const name = fn !== undefined && fn.length > 0 ? fn : n === undefined ? undefined : nameFromN(n)

  const tel = fields.get('TEL')
  const email = fields.get('EMAIL')
  const org = fields.get('ORG')

  return {
    kind: 'contact',
    fields: {
      name: name === undefined || name.length === 0 ? undefined : name,
      tel: tel === undefined || tel.length === 0 ? undefined : tel,
      email: email === undefined || email.length === 0 ? undefined : email,
      org: org === undefined || org.length === 0 ? undefined : org,
    },
  }
}
