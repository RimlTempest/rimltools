/**
 * 振り分け用の一貫ハッシュ。ブラウザ・Workers・Bun のどれでも同じ値になる同期関数。
 */

const encoder = new TextEncoder()

/** FNV-1a（32 bit）。入力は UTF-8 バイト列として扱う */
export const fnv1a32 = (input: string): number => {
  let hash = 0x811c9dc5
  for (const byte of encoder.encode(input)) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** `(flagKey, subject)` を 0..9999 のバケットに割り当てる（0.01% 刻み） */
export const bucketOf = (flagKey: string, subject: string): number =>
  fnv1a32(`${flagKey}\u0000${subject}`) % 10_000
