/**
 * FNV-1a（32 bit）。**同じ入力に必ず同じ数**を返すことだけが要件で、
 * 暗号用途には使わない。
 *
 * presence の色と、ゲストの既定表示名がこれを共有する。片方だけ別の
 * ハッシュにすると「同じ人なのに色が変わる」ような食い違いが起きる。
 */
const FNV_OFFSET_BASIS = 2_166_136_261
const FNV_PRIME = 16_777_619

export const fnv1a = (value: string): number => {
  let hash = FNV_OFFSET_BASIS
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), FNV_PRIME) >>> 0
  }
  return hash
}
