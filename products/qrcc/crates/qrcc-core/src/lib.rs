//! qrcc のドメイン型。I/O を持たず、`worker` crate にも依存しない。
//!
//! ここに置くもの: symbology / payload / style の型、バリデーション、
//! `qrcc-web` との API 契約 (`api` モジュール)。
//!
//! ここに置かないもの: ファイル・ネットワーク・時計・乱数。
//! 呼び出し側から引数で受け取る。
#![forbid(unsafe_code)]

pub mod api;
pub mod payload;
pub mod style;
pub mod symbology;

/// 生成仕様を一意に表すハッシュ。R2 のキャッシュキーに使う。
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct SpecHash(String);

impl SpecHash {
    /// 32 バイトのダイジェストを 16 進小文字で受け取る。
    pub fn parse(value: &str) -> Result<Self, InvalidSpecHash> {
        let ok = value.len() == 64
            && value
                .bytes()
                .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase());
        if ok {
            Ok(Self(value.to_owned()))
        } else {
            Err(InvalidSpecHash)
        }
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
#[error("spec hash must be 64 lowercase hex characters")]
pub struct InvalidSpecHash;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spec_hash_accepts_64_lowercase_hex() {
        let raw = "a".repeat(64);
        assert_eq!(SpecHash::parse(&raw).map(|h| h.as_str().len()), Ok(64));
    }

    #[test]
    fn spec_hash_rejects_wrong_length_and_uppercase() {
        assert_eq!(SpecHash::parse(&"a".repeat(63)), Err(InvalidSpecHash));
        assert_eq!(SpecHash::parse(&"A".repeat(64)), Err(InvalidSpecHash));
    }
}
