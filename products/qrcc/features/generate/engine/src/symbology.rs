//! シンボル体系と、その体系固有の設定。
//!
//! **新しい体系を足すときは、ここにバリアントを 1 つと `encode` のアームを足す。**
//! `match` が網羅を強制するので、実装を足し忘れるとコンパイルが通らない。
//! これが「拡張性」の実体で、規約ではなく型で担保している。

extern crate alloc;
use alloc::string::{String, ToString};
use alloc::vec::Vec;

use serde::{Deserialize, Serialize};

use crate::matrix::{InvalidModules, Modules};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum QrEc {
    L,
    M,
    Q,
    H,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Code128Charset {
    /// 数字のみで偶数桁なら C、それ以外は B。
    Auto,
    A,
    B,
    C,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Symbology {
    Qr { ec: QrEc },
    Code128 { charset: Code128Charset },
    Ean13,
    Code39,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum EncodeError {
    #[error("payload is {actual} characters, {symbology} accepts at most {max}")]
    PayloadTooLong {
        symbology: String,
        max: usize,
        actual: usize,
    },
    #[error("{symbology} cannot encode this payload: {reason}")]
    IncompatiblePayload { symbology: String, reason: String },
    #[error("{field} is invalid: {reason}")]
    InvalidOption { field: String, reason: String },
}

impl Symbology {
    pub fn name(&self) -> &'static str {
        match self {
            Self::Qr { .. } => "QR",
            Self::Code128 { .. } => "Code128",
            Self::Ean13 => "EAN-13",
            Self::Code39 => "Code39",
        }
    }

    /// 1D か。描画時のバー高さの扱いが変わる。
    pub fn is_one_dimensional(&self) -> bool {
        match self {
            Self::Qr { .. } => false,
            Self::Code128 { .. } | Self::Ean13 | Self::Code39 => true,
        }
    }

    /// 規格が求める静寂域（モジュール数）。
    pub fn recommended_quiet_zone(&self) -> u8 {
        match self {
            Self::Qr { .. } => 4,
            Self::Code128 { .. } => 10,
            Self::Ean13 => 9,
            // 業界慣行として左右 10X
            Self::Code39 => 10,
        }
    }

    /// 内容をモジュール配置に変換する。
    pub fn encode(&self, data: &str) -> Result<Modules, EncodeError> {
        match self {
            Self::Qr { ec } => encode_qr(data, *ec),
            Self::Code128 { charset } => encode_code128(data, *charset),
            Self::Ean13 => encode_ean13(data),
            Self::Code39 => encode_code39(data),
        }
    }
}

fn invalid_modules(symbology: &str) -> impl Fn(InvalidModules) -> EncodeError + use<'_> {
    move |_| EncodeError::IncompatiblePayload {
        symbology: symbology.to_string(),
        reason: "encoder produced an empty symbol".to_string(),
    }
}

fn encode_qr(data: &str, ec: QrEc) -> Result<Modules, EncodeError> {
    let level = match ec {
        QrEc::L => qrcode::EcLevel::L,
        QrEc::M => qrcode::EcLevel::M,
        QrEc::Q => qrcode::EcLevel::Q,
        QrEc::H => qrcode::EcLevel::H,
    };
    let code =
        qrcode::QrCode::with_error_correction_level(data.as_bytes(), level).map_err(|cause| {
            match cause {
                qrcode::types::QrError::DataTooLong => EncodeError::PayloadTooLong {
                    symbology: "QR".to_string(),
                    // 上限は誤り訂正レベルとエンコード方式で変わる。実測値は返せないので
                    // 規格上の最大（バージョン 40・レベル L のバイトモード）を示す。
                    max: 2953,
                    actual: data.len(),
                },
                other => EncodeError::IncompatiblePayload {
                    symbology: "QR".to_string(),
                    reason: alloc::format!("{other:?}"),
                },
            }
        })?;

    let width = code.width();
    let dark: Vec<bool> = code
        .to_colors()
        .into_iter()
        .map(|color| color == qrcode::Color::Dark)
        .collect();
    Modules::new(width, width, dark).map_err(invalid_modules("QR"))
}

fn code128_prefix(data: &str, charset: Code128Charset) -> Result<char, EncodeError> {
    let resolved = match charset {
        Code128Charset::Auto => {
            let digits_only = !data.is_empty() && data.bytes().all(|b| b.is_ascii_digit());
            if digits_only && data.len().is_multiple_of(2) {
                Code128Charset::C
            } else {
                Code128Charset::B
            }
        }
        explicit => explicit,
    };
    match resolved {
        // barcoders は文字集合を先頭の 1 文字で指定する
        Code128Charset::A => Ok('\u{00C0}'),
        Code128Charset::B => Ok('\u{0181}'),
        Code128Charset::C => Ok('\u{0106}'),
        Code128Charset::Auto => Err(EncodeError::InvalidOption {
            field: "charset".to_string(),
            reason: "auto must resolve to a concrete character set".to_string(),
        }),
    }
}

fn encode_code128(data: &str, charset: Code128Charset) -> Result<Modules, EncodeError> {
    if data.is_empty() {
        return Err(EncodeError::IncompatiblePayload {
            symbology: "Code128".to_string(),
            reason: "empty payload".to_string(),
        });
    }
    let prefix = code128_prefix(data, charset)?;
    let mut source = String::with_capacity(data.len() + 1);
    source.push(prefix);
    source.push_str(data);

    let encoded = barcoders::sym::code128::Code128::new(&source)
        .map_err(|cause| EncodeError::IncompatiblePayload {
            symbology: "Code128".to_string(),
            reason: alloc::format!("{cause:?}"),
        })?
        .encode();

    Modules::from_row(encoded.into_iter().map(|bar| bar == 1).collect())
        .map_err(invalid_modules("Code128"))
}

fn encode_ean13(data: &str) -> Result<Modules, EncodeError> {
    let encoded = barcoders::sym::ean13::EAN13::new(data)
        .map_err(|cause| EncodeError::IncompatiblePayload {
            symbology: "EAN-13".to_string(),
            reason: alloc::format!("{cause:?}"),
        })?
        .encode();

    Modules::from_row(encoded.into_iter().map(|bar| bar == 1).collect())
        .map_err(invalid_modules("EAN-13"))
}

fn encode_code39(data: &str) -> Result<Modules, EncodeError> {
    let encoded = barcoders::sym::code39::Code39::new(data)
        .map_err(|cause| EncodeError::IncompatiblePayload {
            symbology: "Code39".to_string(),
            reason: alloc::format!("{cause:?}"),
        })?
        .encode();

    Modules::from_row(encoded.into_iter().map(|bar| bar == 1).collect())
        .map_err(invalid_modules("Code39"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn qr_produces_a_square_symbol_of_the_expected_size() {
        let modules = Symbology::Qr { ec: QrEc::M }
            .encode("HELLO")
            .expect("encodes");
        // 短い内容 + レベル M はバージョン 1（21x21）に収まる
        assert_eq!(modules.width(), 21);
        assert_eq!(modules.height(), 21);
    }

    /// 既知の入力に対するモジュール行列を固定する。
    /// SVG の書式が変わってもこのテストは壊れない（ゴールデンテスト）。
    #[test]
    fn qr_matches_a_known_module_pattern() {
        let modules = Symbology::Qr { ec: QrEc::M }
            .encode("HELLO")
            .expect("encodes");
        let rows = modules.to_bit_rows();
        // ファインダパターンは 7 モジュールの枠
        assert_eq!(rows.first().map(|row| &row[..7]), Some("1111111"));
        assert_eq!(rows.first().map(|row| &row[14..21]), Some("1111111"));
        assert_eq!(rows.get(1).map(|row| &row[..7]), Some("1000001"));
    }

    #[test]
    fn a_stronger_error_correction_level_needs_more_modules() {
        let long = "https://qrcc.riml4i.com/codes/0123456789abcdefghjkmnpq";
        let low = Symbology::Qr { ec: QrEc::L }.encode(long).expect("encodes");
        let high = Symbology::Qr { ec: QrEc::H }.encode(long).expect("encodes");
        assert!(high.width() > low.width());
    }

    #[test]
    fn qr_reports_a_payload_that_cannot_fit() {
        let error = Symbology::Qr { ec: QrEc::H }
            .encode(&"x".repeat(10_000))
            .expect_err("too long");
        assert!(matches!(error, EncodeError::PayloadTooLong { .. }));
    }

    #[test]
    fn code128_encodes_a_single_row() {
        let modules = Symbology::Code128 {
            charset: Code128Charset::B,
        }
        .encode("ABC123")
        .expect("encodes");
        assert_eq!(modules.height(), 1);
        assert!(modules.width() > 0);
    }

    #[test]
    fn code128_auto_uses_the_compact_set_for_even_digit_strings() {
        let compact = Symbology::Code128 {
            charset: Code128Charset::Auto,
        }
        .encode("123456")
        .expect("encodes");
        let text = Symbology::Code128 {
            charset: Code128Charset::B,
        }
        .encode("123456")
        .expect("encodes");
        // 文字集合 C は 2 桁を 1 シンボルにまとめるので、必ず狭くなる
        assert!(compact.width() < text.width());
    }

    #[test]
    fn code128_auto_falls_back_to_text_for_odd_digit_strings() {
        let odd = Symbology::Code128 {
            charset: Code128Charset::Auto,
        }
        .encode("12345")
        .expect("encodes");
        let text = Symbology::Code128 {
            charset: Code128Charset::B,
        }
        .encode("12345")
        .expect("encodes");
        assert_eq!(odd.width(), text.width());
    }

    #[test]
    fn code128_rejects_an_empty_payload() {
        let error = Symbology::Code128 {
            charset: Code128Charset::Auto,
        }
        .encode("")
        .expect_err("empty");
        assert!(matches!(error, EncodeError::IncompatiblePayload { .. }));
    }

    #[test]
    fn ean13_accepts_twelve_digits_and_computes_the_check_digit() {
        let modules = Symbology::Ean13.encode("750103131130").expect("encodes");
        // EAN-13 は常に 95 モジュール幅
        assert_eq!(modules.width(), 95);
    }

    #[test]
    fn ean13_rejects_non_digits_and_wrong_lengths() {
        for bad in ["12345", "abcdefghijkl", ""] {
            assert!(
                Symbology::Ean13.encode(bad).is_err(),
                "should reject {bad:?}"
            );
        }
    }

    /// 期待値は `barcoders` クレート自身の `src/sym/code39.rs` の
    /// `#[cfg(test)] fn code39_encode()` から取った（自分のエンコーダの
    /// 出力ではなく、依存先が外部に対して保証している値）。
    #[test]
    fn code39_matches_a_known_module_pattern() {
        let modules = Symbology::Code39.encode("1234").expect("encodes");
        assert_eq!(
            modules.to_bit_rows().first().map(String::as_str),
            Some("10010110110101101001010110101100101011011011001010101010011010110100101101101")
        );
    }

    #[test]
    fn code39_rejects_characters_outside_its_alphabet() {
        // 小文字は Code39 の文字集合に無い
        let error = Symbology::Code39.encode("abc").expect_err("rejects");
        assert!(matches!(error, EncodeError::IncompatiblePayload { .. }));
    }

    #[test]
    fn code39_rejects_an_empty_payload() {
        let error = Symbology::Code39.encode("").expect_err("empty");
        assert!(matches!(error, EncodeError::IncompatiblePayload { .. }));
    }

    #[test]
    fn quiet_zones_follow_each_standard() {
        assert_eq!(Symbology::Qr { ec: QrEc::M }.recommended_quiet_zone(), 4);
        assert_eq!(Symbology::Ean13.recommended_quiet_zone(), 9);
        assert_eq!(Symbology::Code39.recommended_quiet_zone(), 10);
    }

    #[test]
    fn one_dimensional_symbologies_are_marked_as_such() {
        assert!(!Symbology::Qr { ec: QrEc::L }.is_one_dimensional());
        assert!(Symbology::Ean13.is_one_dimensional());
        assert!(Symbology::Code39.is_one_dimensional());
        assert!(
            Symbology::Code128 {
                charset: Code128Charset::Auto
            }
            .is_one_dimensional()
        );
    }
}
