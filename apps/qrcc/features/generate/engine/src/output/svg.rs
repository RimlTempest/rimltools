//! モジュール配置を SVG にする。
//!
//! 出力は決定的（同じ入力なら同じバイト列）。ゴールデンテストが安定する。

extern crate alloc;
use alloc::format;
use alloc::string::String;

use crate::matrix::Modules;
use crate::style::{ModuleShape, RenderStyle, to_css_color};

pub struct Rendered {
    pub svg: String,
    pub width: u32,
    pub height: u32,
}

/// 1D は 1 行のモジュールを `bar_height` 分だけ引き伸ばす。
fn cell_size(style: &RenderStyle, one_dimensional: bool) -> (u32, u32) {
    let scale = u32::from(style.scale.max(1));
    if one_dimensional {
        (scale, scale * u32::from(style.bar_height.max(1)))
    } else {
        (scale, scale)
    }
}

fn escape_xml(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for character in value.chars() {
        match character {
            '&' => escaped.push_str("&amp;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '"' => escaped.push_str("&quot;"),
            '\'' => escaped.push_str("&apos;"),
            other => escaped.push(other),
        }
    }
    escaped
}

fn shape(style: &RenderStyle, x: u32, y: u32, width: u32, height: u32) -> String {
    match style.module_shape {
        ModuleShape::Square => {
            format!(r#"<rect x="{x}" y="{y}" width="{width}" height="{height}"/>"#)
        }
        ModuleShape::Dot => {
            let radius = width.min(height) / 2;
            format!(
                r#"<circle cx="{}" cy="{}" r="{radius}"/>"#,
                x + width / 2,
                y + height / 2
            )
        }
        ModuleShape::Rounded => {
            let radius = width.min(height) / 4;
            format!(r#"<rect x="{x}" y="{y}" width="{width}" height="{height}" rx="{radius}"/>"#)
        }
    }
}

/// `title` はスクリーンリーダーが読む名前になる。
/// 画像として貼るときは alt も併記し、内容はテキストでも出す（docs/accessibility.md）。
pub fn render_svg(
    modules: &Modules,
    style: &RenderStyle,
    one_dimensional: bool,
    title: &str,
) -> Rendered {
    let (cell_width, cell_height) = cell_size(style, one_dimensional);
    let width = u32::try_from(modules.width()).unwrap_or(u32::MAX) * cell_width;
    let height = u32::try_from(modules.height()).unwrap_or(u32::MAX) * cell_height;

    let mut body = String::new();
    for y in 0..modules.height() {
        for x in 0..modules.width() {
            if !modules.is_dark(x, y) {
                continue;
            }
            let left = u32::try_from(x).unwrap_or(0) * cell_width;
            let top = u32::try_from(y).unwrap_or(0) * cell_height;
            body.push_str(&shape(style, left, top, cell_width, cell_height));
        }
    }

    let background = to_css_color(&style.background);
    let svg = format!(
        concat!(
            r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" "#,
            r#"width="{width}" height="{height}" role="img" aria-label="{title}">"#,
            r#"<title>{title}</title>"#,
            r#"<rect width="100%" height="100%" fill="{background}"/>"#,
            r#"<g fill="{foreground}">{body}</g></svg>"#
        ),
        width = width,
        height = height,
        title = escape_xml(title),
        background = background,
        foreground = style.foreground.as_str(),
        body = body
    );

    Rendered { svg, width, height }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::style::Paint;
    use qrcc_kernel::HexColor;

    fn style() -> RenderStyle {
        RenderStyle::monochrome().expect("built-in colours are valid")
    }

    fn single_dark_module() -> Modules {
        Modules::new(1, 1, alloc::vec![true]).expect("valid")
    }

    #[test]
    fn sizes_the_canvas_from_the_module_count_and_scale() {
        let mut style = style();
        style.scale = 4;
        let rendered = render_svg(&single_dark_module(), &style, false, "t");
        assert_eq!((rendered.width, rendered.height), (4, 4));
        assert!(rendered.svg.contains(r#"viewBox="0 0 4 4""#));
    }

    #[test]
    fn stretches_one_dimensional_symbols_to_the_bar_height() {
        let mut style = style();
        style.scale = 2;
        style.bar_height = 10;
        let rendered = render_svg(&single_dark_module(), &style, true, "t");
        assert_eq!((rendered.width, rendered.height), (2, 20));
    }

    #[test]
    fn draws_only_dark_modules() {
        let modules = Modules::new(2, 1, alloc::vec![true, false]).expect("valid");
        let rendered = render_svg(&modules, &style(), false, "t");
        assert_eq!(rendered.svg.matches("<rect x=").count(), 1);
    }

    #[test]
    fn a_transparent_background_paints_none() {
        let mut style = style();
        style.background = Paint::Transparent;
        let rendered = render_svg(&single_dark_module(), &style, false, "t");
        assert!(rendered.svg.contains(r#"fill="none""#));
    }

    #[test]
    fn module_shapes_change_the_drawn_element() {
        let mut style = style();
        style.module_shape = ModuleShape::Dot;
        assert!(
            render_svg(&single_dark_module(), &style, false, "t")
                .svg
                .contains("<circle")
        );
        style.module_shape = ModuleShape::Rounded;
        assert!(
            render_svg(&single_dark_module(), &style, false, "t")
                .svg
                .contains("rx=")
        );
    }

    #[test]
    fn exposes_the_symbol_to_assistive_technology() {
        let rendered = render_svg(
            &single_dark_module(),
            &style(),
            false,
            "URL: https://example.com",
        );
        assert!(rendered.svg.contains(r#"role="img""#));
        assert!(
            rendered
                .svg
                .contains("<title>URL: https://example.com</title>")
        );
        assert!(
            rendered
                .svg
                .contains(r#"aria-label="URL: https://example.com""#)
        );
    }

    /// 内容がそのまま属性に入るので、退避を忘れると SVG が壊れる。
    #[test]
    fn escapes_the_title_so_the_markup_cannot_break() {
        let rendered = render_svg(&single_dark_module(), &style(), false, r#"a<b>&"c'"#);
        assert!(rendered.svg.contains("&lt;b&gt;&amp;&quot;c&apos;"));
        assert!(!rendered.svg.contains("<b>"));
    }

    #[test]
    fn uses_the_configured_foreground_colour() {
        let mut style = style();
        style.foreground = HexColor::parse("#ff0088").expect("valid colour");
        assert!(
            render_svg(&single_dark_module(), &style, false, "t")
                .svg
                .contains(r##"fill="#ff0088""##)
        );
    }

    #[test]
    fn is_deterministic() {
        let first = render_svg(&single_dark_module(), &style(), false, "t").svg;
        let second = render_svg(&single_dark_module(), &style(), false, "t").svg;
        assert_eq!(first, second);
    }
}
