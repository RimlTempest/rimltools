//! 検出できるシンボル体系。
//!
//! rxing の `BarcodeFormat` と 1 対 1 で対応させる。変換は `match` で書くので、
//! rxing が形式を増やしたらコンパイルが通らなくなり、取りこぼしに必ず気づける。
//! これが「拡張性」の実体で、規約ではなく型で担保している。

use rxing::BarcodeFormat;
use serde::{Deserialize, Serialize};

/// TS 側の定義は `features/scan/contract/symbology.ts`。
/// ワイヤ形式（snake_case の文字列）は両者で一致していなければならない。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScanSymbology {
    Aztec,
    Codabar,
    Code39,
    Code93,
    Code128,
    DataMatrix,
    DxFilmEdge,
    Ean8,
    Ean13,
    Itf,
    Maxicode,
    MicroQr,
    Pdf417,
    Qr,
    RectangularMicroQr,
    Rss14,
    RssExpanded,
    Telepen,
    UpcA,
    UpcE,
    UpcEanExtension,
}

impl ScanSymbology {
    /// 対応するすべての体系。ヒントを指定しないときはこれを全部探す。
    pub const ALL: [Self; 21] = [
        Self::Aztec,
        Self::Codabar,
        Self::Code39,
        Self::Code93,
        Self::Code128,
        Self::DataMatrix,
        Self::DxFilmEdge,
        Self::Ean8,
        Self::Ean13,
        Self::Itf,
        Self::Maxicode,
        Self::MicroQr,
        Self::Pdf417,
        Self::Qr,
        Self::RectangularMicroQr,
        Self::Rss14,
        Self::RssExpanded,
        Self::Telepen,
        Self::UpcA,
        Self::UpcE,
        Self::UpcEanExtension,
    ];

    /// エラー文面に出す名前。画面の表示文言は TS 側のレジストリが持つ。
    pub fn name(self) -> &'static str {
        match self {
            Self::Aztec => "Aztec",
            Self::Codabar => "Codabar",
            Self::Code39 => "Code 39",
            Self::Code93 => "Code 93",
            Self::Code128 => "Code 128",
            Self::DataMatrix => "Data Matrix",
            Self::DxFilmEdge => "DX Film Edge",
            Self::Ean8 => "EAN-8",
            Self::Ean13 => "EAN-13",
            Self::Itf => "ITF",
            Self::Maxicode => "MaxiCode",
            Self::MicroQr => "Micro QR",
            Self::Pdf417 => "PDF417",
            Self::Qr => "QR",
            Self::RectangularMicroQr => "rMQR",
            Self::Rss14 => "GS1 DataBar",
            Self::RssExpanded => "GS1 DataBar Expanded",
            Self::Telepen => "Telepen",
            Self::UpcA => "UPC-A",
            Self::UpcE => "UPC-E",
            Self::UpcEanExtension => "UPC/EAN 追加記号",
        }
    }

    pub fn to_format(self) -> BarcodeFormat {
        match self {
            Self::Aztec => BarcodeFormat::AZTEC,
            Self::Codabar => BarcodeFormat::CODABAR,
            Self::Code39 => BarcodeFormat::CODE_39,
            Self::Code93 => BarcodeFormat::CODE_93,
            Self::Code128 => BarcodeFormat::CODE_128,
            Self::DataMatrix => BarcodeFormat::DATA_MATRIX,
            Self::DxFilmEdge => BarcodeFormat::DXFilmEdge,
            Self::Ean8 => BarcodeFormat::EAN_8,
            Self::Ean13 => BarcodeFormat::EAN_13,
            Self::Itf => BarcodeFormat::ITF,
            Self::Maxicode => BarcodeFormat::MAXICODE,
            Self::MicroQr => BarcodeFormat::MICRO_QR_CODE,
            Self::Pdf417 => BarcodeFormat::PDF_417,
            Self::Qr => BarcodeFormat::QR_CODE,
            Self::RectangularMicroQr => BarcodeFormat::RECTANGULAR_MICRO_QR_CODE,
            Self::Rss14 => BarcodeFormat::RSS_14,
            Self::RssExpanded => BarcodeFormat::RSS_EXPANDED,
            Self::Telepen => BarcodeFormat::TELEPEN,
            Self::UpcA => BarcodeFormat::UPC_A,
            Self::UpcE => BarcodeFormat::UPC_E,
            Self::UpcEanExtension => BarcodeFormat::UPC_EAN_EXTENSION,
        }
    }

    /// rxing が返した形式を自分たちの語彙に直す。
    /// `UNSUPORTED_FORMAT` だけは対応する語彙がないので `None`。
    pub fn from_format(format: BarcodeFormat) -> Option<Self> {
        match format {
            BarcodeFormat::AZTEC => Some(Self::Aztec),
            BarcodeFormat::CODABAR => Some(Self::Codabar),
            BarcodeFormat::CODE_39 => Some(Self::Code39),
            BarcodeFormat::CODE_93 => Some(Self::Code93),
            BarcodeFormat::CODE_128 => Some(Self::Code128),
            BarcodeFormat::DATA_MATRIX => Some(Self::DataMatrix),
            BarcodeFormat::DXFilmEdge => Some(Self::DxFilmEdge),
            BarcodeFormat::EAN_8 => Some(Self::Ean8),
            BarcodeFormat::EAN_13 => Some(Self::Ean13),
            BarcodeFormat::ITF => Some(Self::Itf),
            BarcodeFormat::MAXICODE => Some(Self::Maxicode),
            BarcodeFormat::MICRO_QR_CODE => Some(Self::MicroQr),
            BarcodeFormat::PDF_417 => Some(Self::Pdf417),
            BarcodeFormat::QR_CODE => Some(Self::Qr),
            BarcodeFormat::RECTANGULAR_MICRO_QR_CODE => Some(Self::RectangularMicroQr),
            BarcodeFormat::RSS_14 => Some(Self::Rss14),
            BarcodeFormat::RSS_EXPANDED => Some(Self::RssExpanded),
            BarcodeFormat::TELEPEN => Some(Self::Telepen),
            BarcodeFormat::UPC_A => Some(Self::UpcA),
            BarcodeFormat::UPC_E => Some(Self::UpcE),
            BarcodeFormat::UPC_EAN_EXTENSION => Some(Self::UpcEanExtension),
            BarcodeFormat::UNSUPORTED_FORMAT => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_symbology_survives_a_round_trip_through_rxing() {
        for symbology in ScanSymbology::ALL {
            assert_eq!(
                ScanSymbology::from_format(symbology.to_format()),
                Some(symbology),
                "{symbology:?} は往復で戻ってこない"
            );
        }
    }

    /// rxing が形式を増やしたときに気づけるよう、対応表の件数を固定する。
    #[test]
    fn the_catalogue_has_no_duplicates() {
        let mut seen = std::collections::HashSet::new();
        for symbology in ScanSymbology::ALL {
            assert!(seen.insert(symbology), "{symbology:?} が重複している");
        }
        assert_eq!(seen.len(), 21);
    }

    #[test]
    fn unsupported_formats_have_no_vocabulary() {
        assert_eq!(
            ScanSymbology::from_format(BarcodeFormat::UNSUPORTED_FORMAT),
            None
        );
    }

    /// TS 側の `ScanSymbology` と同じ文字列でなければ、封筒が読めなくなる。
    #[test]
    fn the_wire_format_is_snake_case() {
        let encoded = serde_json::to_string(&ScanSymbology::Qr).expect("serialises");
        assert_eq!(encoded, "\"qr\"");
        assert_eq!(
            serde_json::to_string(&ScanSymbology::DataMatrix).expect("serialises"),
            "\"data_matrix\""
        );
        assert_eq!(
            serde_json::to_string(&ScanSymbology::Code128).expect("serialises"),
            "\"code128\""
        );
        assert_eq!(
            serde_json::to_string(&ScanSymbology::Ean13).expect("serialises"),
            "\"ean13\""
        );
    }

    #[test]
    fn every_symbology_has_a_name() {
        for symbology in ScanSymbology::ALL {
            assert!(!symbology.name().is_empty());
        }
    }
}
