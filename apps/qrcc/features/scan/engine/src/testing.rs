//! テスト用の画像組み立て。
//!
//! **SVG ではなくモジュール行列から PNG を組む。** SVG のラスタライザを挟むと、
//! 落ちたときに「生成が悪いのか・ラスタライズが悪いのか・デコードが悪いのか」が
//! 切り分けられなくなる。ここでは画素を直接置くので、失敗すればデコード側の問題。

use std::io::Cursor;

use image::{DynamicImage, GrayImage, ImageFormat, Luma};
use qrcc_generate::Modules;

const DARK: Luma<u8> = Luma([0]);
const LIGHT: Luma<u8> = Luma([255]);

fn encode(image: GrayImage, format: ImageFormat) -> Vec<u8> {
    let mut out = Vec::new();
    DynamicImage::ImageLuma8(image)
        .write_to(&mut Cursor::new(&mut out), format)
        .expect("in-memory encoding cannot fail");
    out
}

/// 1 モジュールを `scale` 画素の正方形にして描く。静寂域は規格どおり 4 モジュール。
pub fn png_of(modules: &Modules, scale: u32) -> Vec<u8> {
    let padded = modules.with_quiet_zone(4);
    let width = u32::try_from(padded.width()).expect("width fits") * scale;
    let height = u32::try_from(padded.height()).expect("height fits") * scale;
    let image = GrayImage::from_fn(width, height, |x, y| {
        let column = usize::try_from(x / scale).expect("column fits");
        let row = usize::try_from(y / scale).expect("row fits");
        if padded.is_dark(column, row) {
            DARK
        } else {
            LIGHT
        }
    });
    encode(image, ImageFormat::Png)
}

/// 1D バーコード用。高さ 1 行のモジュール列を `bar_height` 画素まで引き伸ばす。
pub fn stretched_png(modules: &Modules, scale: u32, bar_height: u32) -> Vec<u8> {
    let padded = modules.with_quiet_zone(10);
    let width = u32::try_from(padded.width()).expect("width fits") * scale;
    let quiet = 12;
    let height = bar_height + quiet * 2;
    let image = GrayImage::from_fn(width, height, |x, y| {
        let column = usize::try_from(x / scale).expect("column fits");
        let inside_bars = y >= quiet && y < quiet + bar_height;
        if inside_bars && padded.is_dark(column, padded.height() / 2) {
            DARK
        } else {
            LIGHT
        }
    });
    encode(image, ImageFormat::Png)
}

/// 2 つのコードを 1 枚に並べる。複数検出の確認に使う。
pub fn side_by_side_png(left: &Modules, right: &Modules, scale: u32) -> Vec<u8> {
    let left = left.with_quiet_zone(6);
    let right = right.with_quiet_zone(6);
    let left_width = u32::try_from(left.width()).expect("width fits") * scale;
    let right_width = u32::try_from(right.width()).expect("width fits") * scale;
    let height = u32::try_from(left.height().max(right.height())).expect("height fits") * scale;

    let image = GrayImage::from_fn(left_width + right_width, height, |x, y| {
        let row = usize::try_from(y / scale).expect("row fits");
        let dark = if x < left_width {
            left.is_dark(usize::try_from(x / scale).expect("column fits"), row)
        } else {
            right.is_dark(
                usize::try_from((x - left_width) / scale).expect("column fits"),
                row,
            )
        };
        if dark { DARK } else { LIGHT }
    });
    encode(image, ImageFormat::Png)
}

/// コードが写っていない画像。上限やエラー枝の確認に使う。
pub fn blank_png(width: u32, height: u32) -> Vec<u8> {
    encode(
        GrayImage::from_pixel(width, height, LIGHT),
        ImageFormat::Png,
    )
}

/// 同じ絵を JPEG で持ち直す。写真から読む経路の確認に使う。
pub fn jpeg_of(png: &[u8]) -> Vec<u8> {
    let decoded = image::load_from_memory(png).expect("the fixture is a valid image");
    encode(decoded.to_luma8(), ImageFormat::Jpeg)
}
