//! 生成要求 → 生成結果。
//!
//! docs/api-contract.md の `render` メソッドの本体。
//! 判定はすべてここに集約し、Worker からもブラウザ wasm からも同じ関数を呼ぶ。

extern crate alloc;
use alloc::string::{String, ToString};
use alloc::vec::Vec;

use serde::{Deserialize, Serialize};

use crate::output::render_svg;
use crate::payload::CodePayload;
use crate::style::{MIN_READABLE_CONTRAST, RenderStyle, contrast_ratio};
use crate::symbology::{EncodeError, Symbology};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OutputFormat {
    Svg,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RenderRequest {
    pub payload: CodePayload,
    pub symbology: Symbology,
    pub style: RenderStyle,
    pub output: OutputFormat,
}

/// 生成は止めないが、利用者に伝えるべきこと。
///
/// **警告とエラーを分ける。** コントラスト不足で生成を拒否すると、
/// 表現の自由を奪ってしまう（docs/accessibility.md）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum RenderWarning {
    LowContrast { ratio: f64, minimum: f64 },
    TransparentBackground,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RenderResponse {
    pub body: String,
    pub content_type: String,
    pub width: u32,
    pub height: u32,
    /// 人が読める内容。画像だけで提供しないための併記用（WCAG 1.1.1）。
    pub description: String,
    pub warnings: Vec<RenderWarning>,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error, Serialize, Deserialize)]
#[serde(untagged)]
pub enum RenderError {
    #[error(transparent)]
    Encode(#[from] EncodeError),
}

fn warnings_for(style: &RenderStyle) -> Vec<RenderWarning> {
    match contrast_ratio(&style.foreground, &style.background) {
        None => alloc::vec![RenderWarning::TransparentBackground],
        Some(ratio) if ratio < MIN_READABLE_CONTRAST => {
            alloc::vec![RenderWarning::LowContrast {
                ratio,
                minimum: MIN_READABLE_CONTRAST
            }]
        }
        Some(_) => Vec::new(),
    }
}

pub fn render(request: &RenderRequest) -> Result<RenderResponse, RenderError> {
    let data = request.payload.encode();
    let modules = request.symbology.encode(&data)?;
    let quiet_zone = request
        .style
        .quiet_zone
        .unwrap_or_else(|| request.symbology.recommended_quiet_zone());
    let padded = modules.with_quiet_zone(usize::from(quiet_zone));

    let description = request.payload.describe();
    let rendered = render_svg(
        &padded,
        &request.style,
        request.symbology.is_one_dimensional(),
        &description,
    );

    Ok(RenderResponse {
        body: rendered.svg,
        content_type: "image/svg+xml".to_string(),
        width: rendered.width,
        height: rendered.height,
        description,
        warnings: warnings_for(&request.style),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::style::Paint;
    use crate::symbology::QrEc;
    use qrcc_kernel::{HexColor, HttpUrl};

    fn request() -> RenderRequest {
        RenderRequest {
            payload: CodePayload::Url {
                url: HttpUrl::parse("https://qrcc.riml4i.com").expect("valid url"),
            },
            symbology: Symbology::Qr { ec: QrEc::M },
            style: RenderStyle::monochrome().expect("built-in colours are valid"),
            output: OutputFormat::Svg,
        }
    }

    #[test]
    fn renders_svg_with_the_declared_content_type() {
        let response = render(&request()).expect("renders");
        assert_eq!(response.content_type, "image/svg+xml");
        assert!(response.body.starts_with("<svg"));
    }

    #[test]
    fn adds_the_quiet_zone_required_by_the_standard() {
        let mut bare = request();
        bare.style.quiet_zone = Some(0);
        let padded = render(&request()).expect("renders");
        let unpadded = render(&bare).expect("renders");
        // QR の推奨は 4 モジュール。両側で 8 モジュール分広くなる
        assert_eq!(
            padded.width,
            unpadded.width + 8 * u32::from(request().style.scale)
        );
    }

    #[test]
    fn always_returns_a_human_readable_description() {
        let response = render(&request()).expect("renders");
        assert_eq!(response.description, "URL: https://qrcc.riml4i.com");
    }

    #[test]
    fn a_readable_colour_pair_produces_no_warnings() {
        assert!(render(&request()).expect("renders").warnings.is_empty());
    }

    /// 生成は成功させたうえで警告する。拒否すると表現の自由を奪う。
    #[test]
    fn warns_about_low_contrast_without_refusing_to_render() {
        let mut low = request();
        low.style.foreground = HexColor::parse("#777777").expect("valid colour");
        low.style.background = Paint::Solid {
            color: HexColor::parse("#888888").expect("valid colour"),
        };
        let response = render(&low).expect("renders anyway");
        assert!(response.body.starts_with("<svg"));
        assert!(matches!(
            response.warnings.first(),
            Some(RenderWarning::LowContrast { .. })
        ));
    }

    #[test]
    fn warns_when_the_background_is_transparent() {
        let mut transparent = request();
        transparent.style.background = Paint::Transparent;
        let response = render(&transparent).expect("renders");
        assert_eq!(
            response.warnings,
            alloc::vec![RenderWarning::TransparentBackground]
        );
    }

    #[test]
    fn surfaces_encoding_failures_as_errors() {
        let mut too_long = request();
        too_long.payload = CodePayload::Text {
            text: "x".repeat(10_000),
        };
        assert!(render(&too_long).is_err());
    }

    #[test]
    fn is_deterministic_for_the_same_request() {
        assert_eq!(
            render(&request()).expect("renders"),
            render(&request()).expect("renders")
        );
    }
}
