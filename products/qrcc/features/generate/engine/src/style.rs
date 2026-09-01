//! 見た目の設定。symbology とは独立して持つ。

extern crate alloc;
use alloc::string::{String, ToString};

use qrcc_kernel::{HexColor, TextParseError};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Paint {
    Solid { color: HexColor },
    Transparent,
}

/// 2D シンボルのモジュール形状。1D では無視される。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ModuleShape {
    #[default]
    Square,
    Dot,
    Rounded,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RenderStyle {
    pub foreground: HexColor,
    pub background: Paint,
    /// 1 モジュールあたりの px。
    pub scale: u16,
    /// 静寂域（モジュール数）。`None` なら symbology の推奨値を使う。
    pub quiet_zone: Option<u8>,
    pub module_shape: ModuleShape,
    /// 1D のバー高さ（モジュール数）。2D では無視される。
    pub bar_height: u16,
    /// 1D の下に数字を出すか。2D では無視される。
    pub human_readable: bool,
}

impl RenderStyle {
    /// 黒地に白の既定値。
    ///
    /// 色は必ずパースを通すので、`Default` にはできない（失敗しうる）。
    /// ここで無理に握りつぶすと、到達しないはずの分岐が残って読み手を惑わせる。
    pub fn monochrome() -> Result<Self, TextParseError> {
        Ok(Self {
            foreground: HexColor::parse("#000000")?,
            background: Paint::Solid {
                color: HexColor::parse("#ffffff")?,
            },
            scale: 8,
            quiet_zone: None,
            module_shape: ModuleShape::Square,
            bar_height: 40,
            human_readable: true,
        })
    }
}

/// WCAG の相対輝度。
fn relative_luminance(color: &HexColor) -> f64 {
    let (red, green, blue) = to_rgb(color);
    let channel = |value: u8| {
        let normalized = f64::from(value) / 255.0;
        if normalized <= 0.039_28 {
            normalized / 12.92
        } else {
            ((normalized + 0.055) / 1.055).powf(2.4)
        }
    };
    0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
}

fn to_rgb(color: &HexColor) -> (u8, u8, u8) {
    let digits = color.as_str().strip_prefix('#').unwrap_or_default();
    let expand = |slice: &str| u8::from_str_radix(slice, 16).unwrap_or(0);
    match digits.len() {
        3 => {
            let pair = |index: usize| {
                digits
                    .get(index..index + 1)
                    .map(|d| expand(&alloc::format!("{d}{d}")))
                    .unwrap_or(0)
            };
            (pair(0), pair(1), pair(2))
        }
        _ => {
            let pair = |index: usize| digits.get(index..index + 2).map(expand).unwrap_or(0);
            (pair(0), pair(2), pair(4))
        }
    }
}

/// 前景と背景のコントラスト比（1.0〜21.0）。
///
/// 読み取り機はしきい値以下だと誤読しやすい。生成は止めず、警告として返す
/// （表現の自由を奪わないため。docs/accessibility.md）。
pub fn contrast_ratio(foreground: &HexColor, background: &Paint) -> Option<f64> {
    let Paint::Solid { color } = background else {
        return None;
    };
    let a = relative_luminance(foreground);
    let b = relative_luminance(color);
    let (lighter, darker) = if a > b { (a, b) } else { (b, a) };
    Some((lighter + 0.05) / (darker + 0.05))
}

/// これを下回ると読み取り失敗が現実的に起きる。
pub const MIN_READABLE_CONTRAST: f64 = 3.0;

pub fn to_css_color(paint: &Paint) -> String {
    match paint {
        Paint::Solid { color } => color.as_str().to_string(),
        Paint::Transparent => "none".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn color(value: &str) -> HexColor {
        HexColor::parse(value).expect("valid color")
    }

    #[test]
    fn black_on_white_is_the_maximum_contrast() {
        let ratio = contrast_ratio(
            &color("#000000"),
            &Paint::Solid {
                color: color("#ffffff"),
            },
        )
        .expect("solid background");
        assert!((ratio - 21.0).abs() < 0.01, "ratio was {ratio}");
    }

    #[test]
    fn the_same_colour_has_no_contrast() {
        let ratio = contrast_ratio(
            &color("#808080"),
            &Paint::Solid {
                color: color("#808080"),
            },
        )
        .expect("solid background");
        assert!((ratio - 1.0).abs() < 0.001, "ratio was {ratio}");
    }

    #[test]
    fn three_digit_and_six_digit_colours_agree() {
        let short = contrast_ratio(
            &color("#fff"),
            &Paint::Solid {
                color: color("#000"),
            },
        );
        let long = contrast_ratio(
            &color("#ffffff"),
            &Paint::Solid {
                color: color("#000000"),
            },
        );
        assert_eq!(
            short.map(|r| (r * 100.0).round()),
            long.map(|r| (r * 100.0).round())
        );
    }

    #[test]
    fn a_transparent_background_has_no_measurable_contrast() {
        assert_eq!(contrast_ratio(&color("#000"), &Paint::Transparent), None);
    }

    #[test]
    fn a_low_contrast_pair_falls_below_the_readable_threshold() {
        let ratio = contrast_ratio(
            &color("#777777"),
            &Paint::Solid {
                color: color("#888888"),
            },
        )
        .expect("solid background");
        assert!(ratio < MIN_READABLE_CONTRAST, "ratio was {ratio}");
    }

    #[test]
    fn the_default_style_is_readable() {
        let style = RenderStyle::monochrome().expect("built-in colours are valid");
        let ratio = contrast_ratio(&style.foreground, &style.background).expect("solid background");
        assert!(ratio >= MIN_READABLE_CONTRAST);
    }

    #[test]
    fn transparent_paints_as_none_in_svg() {
        assert_eq!(to_css_color(&Paint::Transparent), "none");
        assert_eq!(
            to_css_color(&Paint::Solid {
                color: color("#123456")
            }),
            "#123456"
        );
    }
}
