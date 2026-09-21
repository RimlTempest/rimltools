//! エンティティ識別子。
//!
//! - 種類ごとに接頭辞を持たせ、型（newtype）とデータ（接頭辞）の**両方**で
//!   取り違えを止める
//! - 本体は Crockford base32
//! - 乱数は引数で受け取る。この層に I/O はない
//!
//! TS 側の実装は `shared/contract/src/id.ts`。両者は
//! `shared/kernel/fixtures/ids.json` の同じケースで検証される。

extern crate alloc;
use alloc::string::{String, ToString};

use serde::{Deserialize, Serialize};

use crate::base32::{CROCKFORD_BASE32_ALPHABET, encode_crockford_base32};

/// ID 本体の文字数（120 bit）。
pub const ID_BODY_LENGTH: usize = 24;
/// ID 発行に必要な乱数バイト数（24 文字 × 5 bit = 120 bit）。
pub const ID_RANDOM_BYTES: usize = 15;
/// 共有トークンの文字数（160 bit）。
pub const SHARE_TOKEN_LENGTH: usize = 32;
/// 共有トークン発行に必要な乱数バイト数。
pub const SHARE_TOKEN_RANDOM_BYTES: usize = 20;

const RECEIVED_PREVIEW_LENGTH: usize = 32;

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error, Serialize, Deserialize)]
#[error("invalid id: expected {expected}, received {received}")]
#[serde(tag = "kind", rename = "invalid_id")]
pub struct IdParseError {
    pub expected: String,
    /// 診断用に切り詰めた入力。長い入力をそのままログに流さない。
    pub received: String,
}

fn preview(value: &str) -> String {
    match value.char_indices().nth(RECEIVED_PREVIEW_LENGTH) {
        Some((cut, _)) => {
            let mut shortened = value.get(..cut).unwrap_or_default().to_string();
            shortened.push('…');
            shortened
        }
        None => value.to_string(),
    }
}

fn is_base32_body(body: &str, length: usize) -> bool {
    body.len() == length && body.bytes().all(|b| CROCKFORD_BASE32_ALPHABET.contains(&b))
}

macro_rules! prefixed_id {
    ($name:ident, $prefix:literal, $doc:literal) => {
        #[doc = $doc]
        #[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
        #[serde(try_from = "String", into = "String")]
        pub struct $name(String);

        impl $name {
            pub const PREFIX: &'static str = $prefix;

            /// 形式を検証して包む。`parse` を通さずに作る方法は存在しない。
            pub fn parse(value: &str) -> Result<Self, IdParseError> {
                match value.strip_prefix(concat!($prefix, "_")) {
                    Some(body) if is_base32_body(body, ID_BODY_LENGTH) => {
                        Ok(Self(value.to_string()))
                    }
                    _ => Err(IdParseError {
                        expected: concat!($prefix, "_ followed by 24 Crockford base32 characters")
                            .to_string(),
                        received: preview(value),
                    }),
                }
            }

            /// 発行した文字列も必ず `parse` を通す。エンコーダの健全性チェックを兼ねる。
            pub fn issue(random: [u8; ID_RANDOM_BYTES]) -> Result<Self, IdParseError> {
                let body = encode_crockford_base32(&random);
                Self::parse(&alloc::format!("{}_{}", $prefix, body))
            }

            pub fn as_str(&self) -> &str {
                &self.0
            }
        }

        impl TryFrom<String> for $name {
            type Error = IdParseError;
            fn try_from(value: String) -> Result<Self, Self::Error> {
                Self::parse(&value)
            }
        }

        impl From<$name> for String {
            fn from(value: $name) -> Self {
                value.0
            }
        }
    };
}

prefixed_id!(UserId, "usr", "利用者。ゲストにも発行される。");
prefixed_id!(CodeId, "cd", "保存された QR / バーコード 1 件。");
prefixed_id!(FolderId, "fld", "コードの入れ物。");

/// 共有リンクのトークン。接頭辞を持たず、URL にそのまま載る。
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct ShareToken(String);

impl ShareToken {
    pub fn parse(value: &str) -> Result<Self, IdParseError> {
        if is_base32_body(value, SHARE_TOKEN_LENGTH) {
            Ok(Self(value.to_string()))
        } else {
            Err(IdParseError {
                expected: "32 Crockford base32 characters".to_string(),
                received: preview(value),
            })
        }
    }

    pub fn issue(random: [u8; SHARE_TOKEN_RANDOM_BYTES]) -> Result<Self, IdParseError> {
        Self::parse(&encode_crockford_base32(&random))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl TryFrom<String> for ShareToken {
    type Error = IdParseError;
    fn try_from(value: String) -> Result<Self, Self::Error> {
        Self::parse(&value)
    }
}

impl From<ShareToken> for String {
    fn from(value: ShareToken) -> Self {
        value.0
    }
}

/// 生成仕様の SHA-256。R2 のキャッシュキーに使う。
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct SpecHash(String);

impl SpecHash {
    pub fn parse(value: &str) -> Result<Self, IdParseError> {
        let ok = value.len() == 64
            && value
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b));
        if ok {
            Ok(Self(value.to_string()))
        } else {
            Err(IdParseError {
                expected: "64 lowercase hexadecimal characters".to_string(),
                received: preview(value),
            })
        }
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl TryFrom<String> for SpecHash {
    type Error = IdParseError;
    fn try_from(value: String) -> Result<Self, Self::Error> {
        Self::parse(&value)
    }
}

impl From<SpecHash> for String {
    fn from(value: SpecHash) -> Self {
        value.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_a_well_formed_code_id() {
        assert!(CodeId::parse("cd_0123456789abcdefghjkmnpq").is_ok());
    }

    #[test]
    fn rejects_a_different_prefix() {
        assert!(CodeId::parse("usr_0123456789abcdefghjkmnpq").is_err());
        assert!(UserId::parse("cd_0123456789abcdefghjkmnpq").is_err());
    }

    #[test]
    fn reports_what_was_expected() {
        let error = CodeId::parse("nope").expect_err("must reject");
        assert!(error.expected.contains("cd_"));
        assert_eq!(error.received, "nope");
    }

    #[test]
    fn truncates_a_long_input_in_the_error() {
        let error = CodeId::parse(&"x".repeat(200)).expect_err("must reject");
        assert!(error.received.ends_with('…'));
        assert!(error.received.chars().count() <= RECEIVED_PREVIEW_LENGTH + 1);
    }

    #[test]
    fn issued_ids_round_trip_through_parse() {
        let issued = CodeId::issue([0; ID_RANDOM_BYTES]).expect("issue must succeed");
        assert!(CodeId::parse(issued.as_str()).is_ok());
        assert!(issued.as_str().starts_with("cd_"));
    }

    #[test]
    fn issuing_is_deterministic_in_the_random_bytes() {
        let a = CodeId::issue([7; ID_RANDOM_BYTES]).expect("issue must succeed");
        let b = CodeId::issue([7; ID_RANDOM_BYTES]).expect("issue must succeed");
        let c = CodeId::issue([9; ID_RANDOM_BYTES]).expect("issue must succeed");
        assert_eq!(a, b);
        assert_ne!(a, c);
    }

    #[test]
    fn share_tokens_are_thirty_two_characters() {
        let token = ShareToken::issue([3; SHARE_TOKEN_RANDOM_BYTES]).expect("issue must succeed");
        assert_eq!(token.as_str().len(), SHARE_TOKEN_LENGTH);
    }

    #[test]
    fn spec_hash_requires_lowercase_hex() {
        assert!(SpecHash::parse(&"a".repeat(64)).is_ok());
        assert!(SpecHash::parse(&"A".repeat(64)).is_err());
        assert!(SpecHash::parse(&"a".repeat(63)).is_err());
    }
}
