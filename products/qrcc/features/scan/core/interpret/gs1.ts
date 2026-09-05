/**
 * GS1 の Application Identifier（AI）付きの要素文字列を解釈する。
 *
 * 対応する AI は `01`（GTIN）・`10`（ロット）・`11`（製造日）・
 * `17`（有効期限）・`21`（シリアル）の 5 つだけ（GS1 の AI は 100 種類
 * 以上あり、全部を実装する価値は無い）。それ以外の AI は `unknown` として
 * 値だけ持つ。
 *
 * ## 連結規則（GS1 General Specifications 3 章。barcodefaq.com の要約
 * https://www.barcodefaq.com/barcode-properties/definitions/gs1-application-identifiers/
 * でも確認）
 *
 * - **固定長の AI**（`01`=14桁, `11`/`17`=6桁）は長さが決まっているので、
 *   区切り文字なしで次の AI が続けられる。
 * - **可変長の AI**（`10`・`21`。この計画で対応する 5 つのうち）は、
 *   後ろにまだ別の AI が続くなら区切り文字（FNC1。復号後の文字列では
 *   ASCII の Group Separator = `\x1D`）が必要。**列の最後の要素なら
 *   区切り文字は要らない**。
 *
 * 見分け方は「`]C1` / `]e0` のシンボル体系識別子」または「対応する 5 つの
 * AI のどれかで始まる数字列」。`interpret(text)` はシンボル体系を受け取らない
 * ため、後者はテキストの形だけで判定する。
 */
import type { Gs1Element, Interpretation } from '../../contract/interpretation.ts'

/** 復号後の文字列に現れる GS1 の区切り文字（FNC1 / ASCII Group Separator）。 */
const GS = '\x1d'

type KnownAi = {
  readonly kind: 'gtin' | 'lot' | 'production_date' | 'expiry_date' | 'serial'
  /** 固定長なら桁数。可変長（区切り文字か末尾まで）なら undefined。 */
  readonly fixedLength: number | undefined
}

const KNOWN_AI: ReadonlyMap<string, KnownAi> = new Map([
  ['01', { kind: 'gtin', fixedLength: 14 }],
  ['10', { kind: 'lot', fixedLength: undefined }],
  ['11', { kind: 'production_date', fixedLength: 6 }],
  ['17', { kind: 'expiry_date', fixedLength: 6 }],
  ['21', { kind: 'serial', fixedLength: undefined }],
])

const makeElement = (ai: string, value: string): Gs1Element => {
  const known = KNOWN_AI.get(ai)
  switch (known?.kind) {
    case 'gtin':
      return { ai: '01', kind: 'gtin', gtin: value }
    case 'lot':
      return { ai: '10', kind: 'lot', lot: value }
    case 'production_date':
      return { ai: '11', kind: 'production_date', date: value }
    case 'expiry_date':
      return { ai: '17', kind: 'expiry_date', date: value }
    case 'serial':
      return { ai: '21', kind: 'serial', serial: value }
    case undefined:
      return { ai, kind: 'unknown', value }
  }
}

/**
 * AI 付きの要素文字列を先頭から読み、要素の並びにする。
 * 構造が壊れていて安全に読み進められない（AI らしき 2 桁が取れない、
 * 固定長 AI なのに残りが足りない）ときは `undefined` を返す
 * （呼び出し側が `plain` に落とす）。
 */
const parseElements = (body: string): readonly Gs1Element[] | undefined => {
  const elements: Gs1Element[] = []
  let remaining = body

  while (remaining.length > 0) {
    if (remaining.length < 2 || !/^[0-9]{2}$/.test(remaining.slice(0, 2))) return undefined
    const ai = remaining.slice(0, 2)
    const rest = remaining.slice(2)
    const known = KNOWN_AI.get(ai)

    if (known?.fixedLength !== undefined) {
      if (rest.length < known.fixedLength) return undefined // 途中で切れている
      const value = rest.slice(0, known.fixedLength)
      elements.push(makeElement(ai, value))
      remaining = rest.slice(known.fixedLength)
      // 固定長のあとに区切り文字が来ても（本来は不要だが）許容する
      if (remaining.startsWith(GS)) remaining = remaining.slice(1)
    } else {
      // 可変長（対応している 10・21、または未対応の AI）。
      // 区切り文字があればそこまで、無ければ列の最後として残り全部を値にする
      const separatorIndex = rest.indexOf(GS)
      const value = separatorIndex === -1 ? rest : rest.slice(0, separatorIndex)
      elements.push(makeElement(ai, value))
      remaining = separatorIndex === -1 ? '' : rest.slice(separatorIndex + 1)
    }
  }

  return elements
}

const stripSymbologyIdentifier = (text: string): string => {
  if (text.startsWith(']C1') || text.startsWith(']e0')) return text.slice(3)
  return text
}

export const interpretGs1 = (text: string): Interpretation | undefined => {
  const body = stripSymbologyIdentifier(text)
  // 対応している 5 つの AI のどれかで始まらない文字列は GS1 として扱わない
  // （それ以外の数字列を誤って GS1 と判定しないため）
  if (body.length < 2 || !KNOWN_AI.has(body.slice(0, 2))) return undefined

  const elements = parseElements(body)
  return elements === undefined ? undefined : { kind: 'gs1', elements }
}
