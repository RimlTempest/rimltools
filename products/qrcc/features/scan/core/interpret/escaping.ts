/**
 * `WIFI:` と `MECARD:` が共通で使うエスケープ規則。
 *
 * どちらの書式も `\` `;` `,` `:` の前にバックスラッシュを置いてエスケープする。
 * 区切り文字（`;` など）はエスケープされていないものだけを区切りとして扱う。
 */

/**
 * `delimiter` のうちエスケープされていないものだけで分割する。
 *
 * バックスラッシュ自体は消さずに残す。実際の展開は `unescapeField` が
 * 各要素に対してまとめて行う（責務を分ける）。
 */
export const splitUnescaped = (input: string, delimiter: string): string[] => {
  const parts: string[] = []
  let current = ''
  let escaped = false
  for (const char of input) {
    if (escaped) {
      current += char
      escaped = false
      continue
    }
    if (char === '\\') {
      current += char
      escaped = true
      continue
    }
    if (char === delimiter) {
      parts.push(current)
      current = ''
      continue
    }
    current += char
  }
  parts.push(current)
  return parts
}

/** バックスラッシュエスケープを外す。 */
export const unescapeField = (value: string): string => {
  let result = ''
  let escaped = false
  for (const char of value) {
    if (escaped) {
      result += char
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    result += char
  }
  return result
}
