/**
 * Crockford base32。ID とトークンの表記に使う。
 *
 * 標準の base32 と違い `i` `l` `o` `u` を含まないため、
 * 人が読み上げても取り違えにくく、大文字小文字の揺れも起きない。
 */
const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'

/**
 * バイト列を 5 bit ずつ切り出して符号化する。
 * バイト数が 5 の倍数でない場合、最後の端数は左詰めで 1 文字にする。
 *
 * `charAt` を使うのは、添字アクセスが `string | undefined` になる
 * （`noUncheckedIndexedAccess`）のを避けるため。index は常に 0..31。
 */
export const encodeCrockfordBase32 = (bytes: Uint8Array): string => {
  let buffer = 0
  let bits = 0
  let encoded = ''
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      encoded += ALPHABET.charAt((buffer >>> (bits - 5)) & 31)
      bits -= 5
    }
  }
  if (bits > 0) {
    encoded += ALPHABET.charAt((buffer << (5 - bits)) & 31)
  }
  return encoded
}

/** ID の形式検証に使う文字集合。 */
export const CROCKFORD_BASE32_ALPHABET = ALPHABET
