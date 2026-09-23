/** unknown な JSON を `as` 無しで辿るための最小のガード群。 */

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const at = (value: unknown, ...path: (string | number)[]): unknown => {
  let current = value
  for (const key of path) {
    if (typeof key === 'number') {
      if (!Array.isArray(current)) return undefined
      current = current[key]
    } else {
      if (!isRecord(current)) return undefined
      current = current[key]
    }
  }
  return current
}

export const numberAt = (value: unknown, ...path: (string | number)[]): number | undefined => {
  const n = at(value, ...path)
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}

export const stringAt = (value: unknown, ...path: (string | number)[]): string | undefined => {
  const s = at(value, ...path)
  return typeof s === 'string' ? s : undefined
}
