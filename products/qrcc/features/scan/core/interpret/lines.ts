/**
 * vCard・iCalendar が共通で使う行指向の書式を読む。
 *
 * 各行は `キー[;パラメータ...]:値`。パラメータ（`TYPE=CELL` など）は
 * 読み捨て、キーはコロンより前の最初の `;` までを大文字化して使う。
 * 同じキーが複数回出てきたら**最初のもの**を採用する
 * （TEL が複数あるとき、先頭を代表番号として扱う）。
 */
export const parseLines = (text: string): ReadonlyMap<string, string> => {
  const fields = new Map<string, string>()
  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const line = rawLine.trim()
    if (line.length === 0) continue
    const separatorIndex = line.indexOf(':')
    if (separatorIndex === -1) continue
    const rawKey = line.slice(0, separatorIndex)
    const key = (rawKey.split(';')[0] ?? '').toUpperCase()
    if (key.length === 0) continue
    const value = line.slice(separatorIndex + 1).trim()
    if (!fields.has(key)) fields.set(key, value)
  }
  return fields
}
