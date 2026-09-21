//! 画像バイト列 → 検出結果。
//!
//! docs/api-contract.md の `decode` メソッドの本体。判定はすべてここに集約し、
//! ブラウザ wasm からも Worker からも同じ関数を呼ぶ（ADR-0003）。
//!
//! I/O は持たない。画像は呼び出し側がバイト列にして渡す。

use std::io::Cursor;

use rxing::common::HybridBinarizer;
use rxing::multi::{GenericMultipleBarcodeReader, MultipleBarcodeReader};
use rxing::{
    BinaryBitmap, DecodeHints as RxingHints, Exceptions, Luma8LuminanceSource, MultiFormatReader,
    MultiUseMultiFormatReader, RXingResult, Reader,
};
use serde::{Deserialize, Serialize};

use crate::symbology::ScanSymbology;

/// 1 辺の上限（画素）。無料枠の CPU 予算とブラウザのメモリを守る
/// （docs/free-tier-budget.md）。
pub const MAX_IMAGE_DIMENSION: u32 = 4096;

/// 何を、どれくらい念入りに探すか。
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct DecodeHints {
    /// 探す体系。**空なら対応するすべて**を探す。
    pub symbologies: Vec<ScanSymbology>,
    /// 1 枚から複数のコードを読むか。カメラの 1 コマでは既定の false でよい。
    pub multiple: bool,
    /// 時間をかけて精度を上げるか。カメラの連写では false、画像 1 枚では true。
    pub try_harder: bool,
}

/// 検出位置（画素）。読み取り器が返さないこともあるので、空でありうる。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Corner {
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Detection {
    pub text: String,
    pub symbology: ScanSymbology,
    pub corners: Vec<Corner>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DecodeResponse {
    pub detections: Vec<Detection>,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum DecodeError {
    #[error("the bytes are not a supported image: {detail}")]
    UnsupportedImage { detail: String },
    #[error("the image is {width}x{height}, at most {max} pixels per side is supported")]
    ImageTooLarge { width: u32, height: u32, max: u32 },
    #[error("no code was found in the image")]
    NotFound,
    #[error("a code was found but could not be read: {detail}")]
    Unreadable { detail: String },
    #[error("the decoder returned a format this build does not know")]
    UnsupportedSymbology,
}

fn unsupported_image(cause: impl core::fmt::Display) -> DecodeError {
    DecodeError::UnsupportedImage {
        detail: cause.to_string(),
    }
}

/// 画像の大きさだけを先に読む。
///
/// 復号する前に上限を確かめないと、小さなファイルで巨大な画素配列を確保できてしまう
/// （いわゆる decompression bomb）。
fn measure(bytes: &[u8]) -> Result<(u32, u32), DecodeError> {
    image::ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(unsupported_image)?
        .into_dimensions()
        .map_err(unsupported_image)
}

fn to_luminance(bytes: &[u8]) -> Result<Luma8LuminanceSource, DecodeError> {
    let (width, height) = measure(bytes)?;
    if width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION {
        return Err(DecodeError::ImageTooLarge {
            width,
            height,
            max: MAX_IMAGE_DIMENSION,
        });
    }

    let decoded = image::ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(unsupported_image)?
        .decode()
        .map_err(unsupported_image)?;

    let luma = decoded.to_luma8();
    let (width, height) = luma.dimensions();
    Luma8LuminanceSource::new(luma.into_raw(), width, height).map_err(unsupported_image)
}

fn rxing_hints(hints: &DecodeHints) -> RxingHints {
    let mut converted = RxingHints::default();
    if !hints.symbologies.is_empty() {
        converted.PossibleFormats = Some(
            hints
                .symbologies
                .iter()
                .map(|symbology| symbology.to_format())
                .collect(),
        );
    }
    converted.TryHarder = Some(hints.try_harder);
    converted
}

/// rxing の失敗を、画面が分岐できる形に翻訳する。
///
/// 「見つからない」と「見つかったが読めない」は利用者への案内が違う
/// （角度を変える / 汚れを拭く）ので、同じ kind にまとめない。
fn translate(cause: Exceptions) -> DecodeError {
    match cause {
        Exceptions::NotFoundException(_) => DecodeError::NotFound,
        other => DecodeError::Unreadable {
            detail: other.to_string(),
        },
    }
}

fn to_detection(result: &RXingResult) -> Result<Detection, DecodeError> {
    let symbology = ScanSymbology::from_format(*result.getBarcodeFormat())
        .ok_or(DecodeError::UnsupportedSymbology)?;
    Ok(Detection {
        text: result.getText().to_string(),
        symbology,
        corners: result
            .getPoints()
            .iter()
            .map(|point| Corner {
                x: point.x,
                y: point.y,
            })
            .collect(),
    })
}

/// 画像バイト列（PNG / JPEG / WebP）から QR・バーコードを読む。
///
/// 見つからなかったことは成功ではなく `NotFound` にする。空の一覧を返すと、
/// 呼び出し側が「読めた」と「何も無かった」を取り違える。
pub fn decode(image_bytes: &[u8], hints: &DecodeHints) -> Result<DecodeResponse, DecodeError> {
    let source = to_luminance(image_bytes)?;
    let mut bitmap = BinaryBitmap::new(HybridBinarizer::new(source));
    let converted = rxing_hints(hints);

    let results: Vec<RXingResult> = if hints.multiple {
        let mut reader = GenericMultipleBarcodeReader::new(MultiUseMultiFormatReader::default());
        reader
            .decode_multiple_with_hints(&mut bitmap, &converted)
            .map_err(translate)?
    } else {
        let mut reader = MultiFormatReader::default();
        vec![
            reader
                .decode_with_hints(&mut bitmap, &converted)
                .map_err(translate)?,
        ]
    };

    let detections = results
        .iter()
        .map(to_detection)
        .collect::<Result<Vec<_>, _>>()?;

    if detections.is_empty() {
        return Err(DecodeError::NotFound);
    }
    Ok(DecodeResponse { detections })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::{blank_png, jpeg_of, png_of, stretched_png};
    use qrcc_generate::symbology::{Code128Charset, QrEc, Symbology};

    fn qr_png(text: &str) -> Vec<u8> {
        let modules = Symbology::Qr { ec: QrEc::M }.encode(text).expect("encodes");
        png_of(&modules, 8)
    }

    fn only(response: &DecodeResponse) -> &Detection {
        assert_eq!(response.detections.len(), 1);
        response.detections.first().expect("one detection")
    }

    #[test]
    fn a_generated_qr_decodes_back_to_the_original_text() {
        let response = decode(&qr_png("HELLO"), &DecodeHints::default()).expect("decodes");
        assert_eq!(only(&response).text, "HELLO");
        assert_eq!(only(&response).symbology, ScanSymbology::Qr);
    }

    #[test]
    fn a_url_survives_the_round_trip() {
        let url = "https://qrcc.riml4i.com/codes/01hqz";
        let response = decode(&qr_png(url), &DecodeHints::default()).expect("decodes");
        assert_eq!(only(&response).text, url);
    }

    /// QR は日本語も入る。バイト列の往復で文字化けしないことを確かめる。
    #[test]
    fn japanese_text_survives_the_round_trip() {
        let text = "在庫ラベル 東京第 1 倉庫";
        let response = decode(&qr_png(text), &DecodeHints::default()).expect("decodes");
        assert_eq!(only(&response).text, text);
    }

    #[test]
    fn jpeg_input_is_accepted_as_well() {
        let response = decode(&jpeg_of(&qr_png("PHOTO")), &DecodeHints::default())
            .expect("decodes a photo of a code");
        assert_eq!(only(&response).text, "PHOTO");
    }

    #[test]
    fn a_generated_code128_decodes_back_to_the_original_text() {
        let modules = Symbology::Code128 {
            charset: Code128Charset::B,
        }
        .encode("ABC-12345")
        .expect("encodes");
        let response = decode(&stretched_png(&modules, 3, 80), &DecodeHints::default())
            .expect("decodes the barcode");
        assert_eq!(only(&response).text, "ABC-12345");
        assert_eq!(only(&response).symbology, ScanSymbology::Code128);
    }

    #[test]
    fn detections_carry_where_the_code_was_found() {
        let response = decode(&qr_png("CORNERS"), &DecodeHints::default()).expect("decodes");
        assert!(
            !only(&response).corners.is_empty(),
            "位置が無いと、画面で当たりを示せない"
        );
    }

    /// ヒントを絞ると、その体系だけを探す。
    #[test]
    fn a_hint_limits_which_symbologies_are_searched() {
        let hints = DecodeHints {
            symbologies: vec![ScanSymbology::Qr],
            ..DecodeHints::default()
        };
        assert!(decode(&qr_png("ONLY-QR"), &hints).is_ok());

        let elsewhere = DecodeHints {
            symbologies: vec![ScanSymbology::Ean13],
            ..DecodeHints::default()
        };
        assert_eq!(
            decode(&qr_png("ONLY-QR"), &elsewhere),
            Err(DecodeError::NotFound)
        );
    }

    #[test]
    fn an_image_without_a_code_is_reported_as_not_found() {
        assert_eq!(
            decode(&blank_png(64, 64), &DecodeHints::default()),
            Err(DecodeError::NotFound)
        );
    }

    #[test]
    fn bytes_that_are_not_an_image_are_rejected() {
        let error = decode(b"not an image at all", &DecodeHints::default())
            .expect_err("cannot be an image");
        assert!(matches!(error, DecodeError::UnsupportedImage { .. }));
    }

    #[test]
    fn an_empty_body_is_rejected() {
        let error = decode(&[], &DecodeHints::default()).expect_err("cannot be an image");
        assert!(matches!(error, DecodeError::UnsupportedImage { .. }));
    }

    /// 上限を超える画像は、復号する前に断る（メモリを確保させない）。
    #[test]
    fn an_oversized_image_is_refused_before_it_is_decoded() {
        let error = decode(
            &blank_png(MAX_IMAGE_DIMENSION + 1, 8),
            &DecodeHints::default(),
        )
        .expect_err("too large");
        assert_eq!(
            error,
            DecodeError::ImageTooLarge {
                width: MAX_IMAGE_DIMENSION + 1,
                height: 8,
                max: MAX_IMAGE_DIMENSION,
            }
        );
    }

    #[test]
    fn an_image_exactly_at_the_limit_is_still_accepted() {
        // 中身は白紙なので「大きすぎる」ではなく「見つからない」になる
        assert_eq!(
            decode(&blank_png(MAX_IMAGE_DIMENSION, 8), &DecodeHints::default()),
            Err(DecodeError::NotFound)
        );
    }

    /// TS 側の `decodeScanError` と同じ形でなければ、画面にエラーが出ない。
    #[test]
    fn errors_serialise_with_a_kind_tag() {
        let encoded = serde_json::to_value(DecodeError::ImageTooLarge {
            width: 5000,
            height: 10,
            max: MAX_IMAGE_DIMENSION,
        })
        .expect("serialises");
        assert_eq!(encoded["kind"], "image_too_large");
        assert_eq!(encoded["width"], 5000);

        let not_found = serde_json::to_value(DecodeError::NotFound).expect("serialises");
        assert_eq!(not_found["kind"], "not_found");
    }

    #[test]
    fn responses_serialise_in_the_shape_the_screen_reads() {
        let response = decode(&qr_png("WIRE"), &DecodeHints::default()).expect("decodes");
        let encoded = serde_json::to_value(&response).expect("serialises");
        assert_eq!(encoded["detections"][0]["text"], "WIRE");
        assert_eq!(encoded["detections"][0]["symbology"], "qr");
        assert!(encoded["detections"][0]["corners"].is_array());
    }

    /// ヒントは既定値で往復できること（TS 側が省略しても読める）。
    #[test]
    fn hints_default_to_searching_everything() {
        let hints: DecodeHints = serde_json::from_str("{}").expect("reads an empty object");
        assert_eq!(hints, DecodeHints::default());
        assert!(hints.symbologies.is_empty());
        assert!(!hints.multiple);
    }

    #[test]
    fn two_codes_in_one_image_are_both_reported() {
        let left = Symbology::Qr { ec: QrEc::M }
            .encode("LEFT")
            .expect("encodes");
        let right = Symbology::Qr { ec: QrEc::M }
            .encode("RIGHT")
            .expect("encodes");
        let sheet = crate::testing::side_by_side_png(&left, &right, 8);

        let hints = DecodeHints {
            multiple: true,
            try_harder: true,
            ..DecodeHints::default()
        };
        let response = decode(&sheet, &hints).expect("decodes both");
        let mut texts: Vec<&str> = response
            .detections
            .iter()
            .map(|detection| detection.text.as_str())
            .collect();
        texts.sort_unstable();
        assert_eq!(texts, vec!["LEFT", "RIGHT"]);
    }
}
