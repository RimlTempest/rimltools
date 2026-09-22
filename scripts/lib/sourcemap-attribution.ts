/**
 * sourcemap から「生成コードのどの部分が、どのソース（パッケージ）から来たか」を数える。
 * バンドルサイズの内訳を出すための集計（docs/bundle.md）。純関数だけ。
 */

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Base64 VLQ の 1 セグメントを数値の列にする。 */
export const decodeVlq = (segment: string): number[] => {
  const values: number[] = []
  let value = 0
  let shift = 0
  for (const char of segment) {
    const digit = BASE64.indexOf(char)
    if (digit < 0) return values
    value += (digit & 31) << shift
    if (digit & 32) {
      shift += 5
      continue
    }
    const negative = value & 1
    const magnitude = value >> 1
    values.push(negative ? -magnitude : magnitude)
    value = 0
    shift = 0
  }
  return values
}

/** ソースのパスを、集計の単位（パッケージ名、またはアプリ内のディレクトリ）にする。 */
export const packageOf = (source: string): string => {
  const parts = source.split('/')
  const nm = parts.lastIndexOf('node_modules')
  if (nm >= 0) {
    const first = parts[nm + 1] ?? '(unknown)'
    return first.startsWith('@') ? `${first}/${parts[nm + 2] ?? ''}` : first
  }
  const meaningful = parts.filter((p) => p !== '..' && p !== '.' && p !== '')
  return `(app) ${meaningful.slice(0, 2).join('/')}`
}

export type SourceMapLike = { sources: string[]; mappings: string }

const UNMAPPED = '(unmapped)'

/**
 * 生成コードの各セグメントを、次のセグメント（または行末）までそのソースに割り当てる。
 * 文字数で数える（UTF-16 のコード単位。サイズの内訳の目安としては十分）。
 */
export const attributeBytes = (code: string, map: SourceMapLike): Map<string, number> => {
  const totals = new Map<string, number>()
  const add = (key: string, n: number) => {
    if (n > 0) totals.set(key, (totals.get(key) ?? 0) + n)
  }
  const lines = code.split('\n')
  const mappingLines = map.mappings.split(';')
  let sourceIndex = 0

  lines.forEach((line, lineNo) => {
    const segments = (mappingLines[lineNo] ?? '').split(',').filter((s) => s !== '')
    let column = 0
    const starts: { column: number; source: string }[] = []
    for (const segment of segments) {
      const fields = decodeVlq(segment)
      column += fields[0] ?? 0
      if (fields.length >= 4) {
        sourceIndex += fields[1] ?? 0
        starts.push({ column, source: map.sources[sourceIndex] ?? UNMAPPED })
      } else {
        starts.push({ column, source: UNMAPPED })
      }
    }
    add(UNMAPPED, Math.min(starts[0]?.column ?? line.length, line.length))
    starts.forEach((start, i) => {
      const end = starts[i + 1]?.column ?? line.length
      add(start.source, Math.max(0, Math.min(end, line.length) - start.column))
    })
  })
  return totals
}
