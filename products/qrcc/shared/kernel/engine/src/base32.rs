//! Crockford base32。ID とトークンの表記に使う。
//!
//! 標準の base32 と違い `i` `l` `o` `u` を含まないため、人が読み上げても
//! 取り違えにくく、大文字小文字の揺れも起きない。
//!
//! TS 側の実装は `packages/contract/src/base32.ts`（`@rimltools/contract`）。両者は
//! `shared/kernel/fixtures/base32.json` の同じベクタで検証される。

extern crate alloc;
use alloc::string::String;

/// ID の形式検証にも使う文字集合。ちょうど 32 要素。
pub const CROCKFORD_BASE32_ALPHABET: &[u8; 32] = b"0123456789abcdefghjkmnpqrstvwxyz";

/// バイト列を 5 bit ずつ切り出して符号化する。
///
/// バイト数が 5 の倍数でない場合、最後の端数は左詰めで 1 文字にする
/// （情報を落とさないため）。
pub fn encode_crockford_base32(bytes: &[u8]) -> String {
    let mut buffer: u32 = 0;
    let mut bits: u32 = 0;
    let mut encoded = String::with_capacity(bytes.len().saturating_mul(8).div_ceil(5));

    for &byte in bytes {
        buffer = (buffer << 8) | u32::from(byte);
        bits += 8;
        while bits >= 5 {
            encoded.push(symbol((buffer >> (bits - 5)) & 31));
            bits -= 5;
        }
    }
    if bits > 0 {
        encoded.push(symbol((buffer << (5 - bits)) & 31));
    }
    encoded
}

/// `index` は呼び出し側で `& 31` されており、必ず 0..=31 に収まる。
#[expect(
    clippy::indexing_slicing,
    reason = "index is masked to 0..=31 and the alphabet has exactly 32 entries"
)]
fn symbol(index: u32) -> char {
    char::from(CROCKFORD_BASE32_ALPHABET[index as usize])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_five_zero_bytes_as_eight_zeros() {
        assert_eq!(encode_crockford_base32(&[0, 0, 0, 0, 0]), "00000000");
    }

    #[test]
    fn encodes_all_ones_as_all_z() {
        assert_eq!(
            encode_crockford_base32(&[255, 255, 255, 255, 255]),
            "zzzzzzzz"
        );
    }

    #[test]
    fn keeps_the_trailing_partial_group() {
        assert_eq!(encode_crockford_base32(&[0b1111_1111]), "zw");
        assert_eq!(encode_crockford_base32(&[0]), "00");
    }

    #[test]
    fn encodes_empty_input_as_empty_string() {
        assert_eq!(encode_crockford_base32(&[]), "");
    }

    #[test]
    fn never_emits_the_ambiguous_letters() {
        let bytes: alloc::vec::Vec<u8> = (0..=255).collect();
        let encoded = encode_crockford_base32(&bytes);
        assert!(!encoded.contains(['i', 'l', 'o', 'u']));
    }
}
