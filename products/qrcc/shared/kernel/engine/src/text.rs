//! 検証済み文字列。
//!
//! 「URL を検証してから使う」ことを型で強制する。
//! TS 側の実装は `shared/contract/src/text.ts`、適合ケースは
//! `shared/kernel/fixtures/text.json`。

extern crate alloc;
use alloc::string::{String, ToString};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error, Serialize, Deserialize)]
#[error("invalid text: expected {expected}")]
#[serde(tag = "kind", rename = "invalid_text")]
pub struct TextParseError {
    pub expected: String,
}

fn invalid(expected: &str) -> TextParseError {
    TextParseError {
        expected: expected.to_string(),
    }
}

macro_rules! validated_text {
    ($name:ident, $expected:literal, $doc:literal, $check:expr) => {
        #[doc = $doc]
        #[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
        #[serde(try_from = "String", into = "String")]
        pub struct $name(String);

        impl $name {
            pub fn parse(value: &str) -> Result<Self, TextParseError> {
                #[allow(clippy::redundant_closure_call)]
                if ($check)(value) {
                    Ok(Self(value.to_string()))
                } else {
                    Err(invalid($expected))
                }
            }

            pub fn as_str(&self) -> &str {
                &self.0
            }
        }

        impl TryFrom<String> for $name {
            type Error = TextParseError;
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

fn is_non_empty_text(value: &str) -> bool {
    value.chars().any(|c| !c.is_whitespace())
}

/// http(s) URL か。
///
/// URL パーサを持ち込むと wasm が太るため、必要な条件だけを直接検査する:
/// スキームが http/https で、権限部（ホスト）が空でなく、空白や制御文字を含まない。
/// TS 側は `URL.canParse` を使うが、`shared/kernel/fixtures/text.json` の
/// ケースでは同じ判定になるよう揃えてある。
fn is_http_url(value: &str) -> bool {
    let rest = match value.split_once("://") {
        Some((scheme, rest)) if scheme.eq_ignore_ascii_case("http") => rest,
        Some((scheme, rest)) if scheme.eq_ignore_ascii_case("https") => rest,
        _ => return false,
    };
    if value.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return false;
    }
    let authority = rest.split(['/', '?', '#']).next().unwrap_or_default();
    !authority.is_empty()
}

fn is_email_address(value: &str) -> bool {
    if value.chars().any(char::is_whitespace) {
        return false;
    }
    let Some((local, domain)) = value.split_once('@') else {
        return false;
    };
    if local.is_empty() || domain.is_empty() || value.matches('@').count() != 1 {
        return false;
    }
    let labels: alloc::vec::Vec<&str> = domain.split('.').collect();
    labels.len() >= 2 && labels.iter().all(|label| !label.is_empty())
}

/// E.164: `+` に続く先頭非ゼロの 8..=15 桁。
fn is_phone_number(value: &str) -> bool {
    let Some(digits) = value.strip_prefix('+') else {
        return false;
    };
    let mut chars = digits.chars();
    let leads_with_non_zero = matches!(chars.next(), Some(c) if c.is_ascii_digit() && c != '0');
    leads_with_non_zero
        && digits.chars().all(|c| c.is_ascii_digit())
        && (8..=15).contains(&digits.len())
}

fn is_hex_color(value: &str) -> bool {
    let Some(digits) = value.strip_prefix('#') else {
        return false;
    };
    matches!(digits.len(), 3 | 6 | 8)
        && digits
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

validated_text!(
    NonEmptyText,
    "at least one non-whitespace character",
    "前後の空白を除いて 1 文字以上ある文字列。",
    is_non_empty_text
);
validated_text!(
    HttpUrl,
    "an absolute http(s) URL",
    "スキームが http/https の URL。`javascript:` などを弾く。",
    is_http_url
);
validated_text!(
    EmailAddress,
    "an email address",
    "メールアドレス。",
    is_email_address
);
validated_text!(
    PhoneNumber,
    "an E.164 phone number, e.g. +819012345678",
    "E.164 形式の電話番号。",
    is_phone_number
);
validated_text!(
    HexColor,
    "#rgb, #rrggbb or #rrggbbaa in lowercase",
    "`#rgb` / `#rrggbb` / `#rrggbbaa`（小文字）。",
    is_hex_color
);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn non_empty_text_rejects_whitespace_only() {
        assert!(NonEmptyText::parse("在庫ラベル").is_ok());
        assert!(NonEmptyText::parse("  名前  ").is_ok());
        for bad in ["", "   ", "\t\n", "\u{3000}"] {
            assert!(NonEmptyText::parse(bad).is_err(), "should reject {bad:?}");
        }
    }

    #[test]
    fn http_url_rejects_dangerous_schemes() {
        assert!(HttpUrl::parse("https://example.com").is_ok());
        for bad in [
            "javascript:alert(1)",
            "data:text/html,x",
            "file:///etc/passwd",
            "https://",
        ] {
            assert!(HttpUrl::parse(bad).is_err(), "should reject {bad:?}");
        }
    }

    #[test]
    fn phone_number_accepts_only_e164() {
        assert!(PhoneNumber::parse("+819012345678").is_ok());
        for bad in ["090-1234-5678", "+0123", "+", "abc"] {
            assert!(PhoneNumber::parse(bad).is_err(), "should reject {bad:?}");
        }
    }

    #[test]
    fn hex_color_requires_lowercase_and_a_known_length() {
        assert!(HexColor::parse("#00ff88").is_ok());
        for bad in ["fff", "#FFF", "#ffff", "#gggggg"] {
            assert!(HexColor::parse(bad).is_err(), "should reject {bad:?}");
        }
    }
}
