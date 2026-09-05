//! エンコードされる内容。
//!
//! 種類ごとに構造が違うので判別可能ユニオンで持つ。
//! 新しい種類を足すときは、ここにバリアントを 1 つと `encode` のアームを足す。
//! `match` が網羅を強制するので、追加漏れはコンパイルエラーになる。

extern crate alloc;
use alloc::format;
use alloc::string::{String, ToString};

use qrcc_kernel::{EmailAddress, HttpUrl, NonEmptyText, PhoneNumber};
use serde::{Deserialize, Serialize};

/// 緯度。-90..=90 の有限な数値であることを serde の境界で強制する。
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(try_from = "f64", into = "f64")]
pub struct Latitude(f64);

impl TryFrom<f64> for Latitude {
    type Error = String;
    fn try_from(value: f64) -> Result<Self, Self::Error> {
        if value.is_finite() && (-90.0..=90.0).contains(&value) {
            Ok(Self(value))
        } else {
            Err(format!(
                "latitude must be a finite number between -90 and 90, got {value}"
            ))
        }
    }
}

impl From<Latitude> for f64 {
    fn from(value: Latitude) -> Self {
        value.0
    }
}

// 検証済みなので常に有限（NaN を含まない）。反射性が保証できるので手で実装する。
impl Eq for Latitude {}

/// 経度。-180..=180 の有限な数値であることを serde の境界で強制する。
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(try_from = "f64", into = "f64")]
pub struct Longitude(f64);

impl TryFrom<f64> for Longitude {
    type Error = String;
    fn try_from(value: f64) -> Result<Self, Self::Error> {
        if value.is_finite() && (-180.0..=180.0).contains(&value) {
            Ok(Self(value))
        } else {
            Err(format!(
                "longitude must be a finite number between -180 and 180, got {value}"
            ))
        }
    }
}

impl From<Longitude> for f64 {
    fn from(value: Longitude) -> Self {
        value.0
    }
}

impl Eq for Longitude {}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum WifiAuth {
    Nopass,
    Wep { password: String },
    Wpa { password: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CodePayload {
    Text {
        text: String,
    },
    Url {
        url: HttpUrl,
    },
    Tel {
        number: PhoneNumber,
    },
    Email {
        to: EmailAddress,
        subject: String,
        body: String,
    },
    Sms {
        number: PhoneNumber,
        body: String,
    },
    Geo {
        lat: Latitude,
        lon: Longitude,
    },
    Wifi {
        ssid: NonEmptyText,
        auth: WifiAuth,
        hidden: bool,
    },
}

/// Wi-Fi 形式で意味を持つ文字を退避する。
/// これを忘れると SSID に `;` が入っただけで別の設定として読まれる。
fn escape_wifi(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for character in value.chars() {
        if matches!(character, '\\' | ';' | ',' | ':' | '"') {
            escaped.push('\\');
        }
        escaped.push(character);
    }
    escaped
}

/// `mailto:` のクエリに乗せる値をパーセントエンコードする。
/// `&` や `=`、空白、日本語などが件名・本文に入っても URI を壊さないようにする。
fn percent_encode(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(byte as char);
            }
            _ => encoded.push_str(&format!("%{byte:02X}")),
        }
    }
    encoded
}

impl CodePayload {
    /// シンボルに載せる文字列。
    pub fn encode(&self) -> String {
        match self {
            Self::Text { text } => text.clone(),
            Self::Url { url } => url.as_str().to_string(),
            Self::Tel { number } => format!("tel:{}", number.as_str()),
            Self::Email { to, subject, body } => format!(
                "mailto:{}?subject={}&body={}",
                to.as_str(),
                percent_encode(subject),
                percent_encode(body)
            ),
            Self::Sms { number, body } => format!("SMSTO:{}:{body}", number.as_str()),
            Self::Geo { lat, lon } => format!("geo:{},{}", lat.0, lon.0),
            Self::Wifi { ssid, auth, hidden } => {
                let (auth_type, password) = match auth {
                    WifiAuth::Nopass => ("nopass", String::new()),
                    WifiAuth::Wep { password } => ("WEP", escape_wifi(password)),
                    WifiAuth::Wpa { password } => ("WPA", escape_wifi(password)),
                };
                format!(
                    "WIFI:T:{auth_type};S:{};P:{password};H:{hidden};;",
                    escape_wifi(ssid.as_str())
                )
            }
        }
    }

    /// UI や alt テキストに出す、人が読める説明。
    pub fn describe(&self) -> String {
        match self {
            Self::Text { text } => format!("テキスト: {text}"),
            Self::Url { url } => format!("URL: {}", url.as_str()),
            Self::Tel { number } => format!("電話番号: {}", number.as_str()),
            Self::Email { to, .. } => format!("メール: {}", to.as_str()),
            Self::Sms { number, .. } => format!("SMS: {}", number.as_str()),
            Self::Geo { lat, lon } => format!("位置情報: {}, {}", lat.0, lon.0),
            Self::Wifi { ssid, .. } => format!("Wi-Fi 設定: {}", ssid.as_str()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ssid(value: &str) -> NonEmptyText {
        NonEmptyText::parse(value).expect("valid ssid")
    }

    #[test]
    fn text_is_encoded_as_is() {
        let payload = CodePayload::Text {
            text: "こんにちは".to_string(),
        };
        assert_eq!(payload.encode(), "こんにちは");
    }

    #[test]
    fn url_is_encoded_as_its_string() {
        let url = HttpUrl::parse("https://example.com/a?b=1").expect("valid url");
        assert_eq!(
            CodePayload::Url { url }.encode(),
            "https://example.com/a?b=1"
        );
    }

    #[test]
    fn tel_is_encoded_with_the_tel_scheme() {
        let number = PhoneNumber::parse("+819012345678").expect("valid number");
        assert_eq!(CodePayload::Tel { number }.encode(), "tel:+819012345678");
    }

    #[test]
    fn tel_describes_itself_for_screen_readers() {
        let number = PhoneNumber::parse("+819012345678").expect("valid number");
        assert_eq!(
            CodePayload::Tel { number }.describe(),
            "電話番号: +819012345678"
        );
    }

    #[test]
    fn email_is_encoded_as_a_mailto_link() {
        let to = EmailAddress::parse("someone@example.com").expect("valid email");
        let payload = CodePayload::Email {
            to,
            subject: "こんにちは".to_string(),
            body: "元気ですか？".to_string(),
        };
        assert_eq!(
            payload.encode(),
            "mailto:someone@example.com?subject=%E3%81%93%E3%82%93%E3%81%AB%E3%81%A1%E3%81%AF&body=%E5%85%83%E6%B0%97%E3%81%A7%E3%81%99%E3%81%8B%EF%BC%9F"
        );
    }

    #[test]
    fn email_percent_encodes_reserved_characters_in_the_query() {
        let to = EmailAddress::parse("someone@example.com").expect("valid email");
        let payload = CodePayload::Email {
            to,
            subject: "a&b=c".to_string(),
            body: "line one".to_string(),
        };
        assert_eq!(
            payload.encode(),
            "mailto:someone@example.com?subject=a%26b%3Dc&body=line%20one"
        );
    }

    #[test]
    fn email_describes_itself_for_screen_readers() {
        let to = EmailAddress::parse("someone@example.com").expect("valid email");
        let payload = CodePayload::Email {
            to,
            subject: String::new(),
            body: String::new(),
        };
        assert_eq!(payload.describe(), "メール: someone@example.com");
    }

    #[test]
    fn sms_is_encoded_with_the_smsto_format() {
        let number = PhoneNumber::parse("+819012345678").expect("valid number");
        let payload = CodePayload::Sms {
            number,
            body: "こんにちは".to_string(),
        };
        assert_eq!(payload.encode(), "SMSTO:+819012345678:こんにちは");
    }

    #[test]
    fn sms_allows_an_empty_body() {
        let number = PhoneNumber::parse("+819012345678").expect("valid number");
        let payload = CodePayload::Sms {
            number,
            body: String::new(),
        };
        assert_eq!(payload.encode(), "SMSTO:+819012345678:");
    }

    #[test]
    fn sms_describes_itself_for_screen_readers() {
        let number = PhoneNumber::parse("+819012345678").expect("valid number");
        let payload = CodePayload::Sms {
            number,
            body: String::new(),
        };
        assert_eq!(payload.describe(), "SMS: +819012345678");
    }

    #[test]
    fn geo_is_encoded_with_the_geo_scheme() {
        let payload = CodePayload::Geo {
            lat: Latitude::try_from(35.681236).expect("valid latitude"),
            lon: Longitude::try_from(139.767125).expect("valid longitude"),
        };
        assert_eq!(payload.encode(), "geo:35.681236,139.767125");
    }

    #[test]
    fn geo_describes_itself_for_screen_readers() {
        let payload = CodePayload::Geo {
            lat: Latitude::try_from(35.681236).expect("valid latitude"),
            lon: Longitude::try_from(139.767125).expect("valid longitude"),
        };
        assert_eq!(payload.describe(), "位置情報: 35.681236, 139.767125");
    }

    #[test]
    fn latitude_accepts_the_boundary_and_rejects_beyond_it() {
        assert!(Latitude::try_from(90.0).is_ok());
        assert!(Latitude::try_from(-90.0).is_ok());
        assert!(Latitude::try_from(90.0001).is_err());
        assert!(Latitude::try_from(-90.0001).is_err());
        assert!(Latitude::try_from(f64::NAN).is_err());
    }

    #[test]
    fn longitude_accepts_the_boundary_and_rejects_beyond_it() {
        assert!(Longitude::try_from(180.0).is_ok());
        assert!(Longitude::try_from(-180.0).is_ok());
        assert!(Longitude::try_from(180.0001).is_err());
        assert!(Longitude::try_from(-180.0001).is_err());
        assert!(Longitude::try_from(f64::NAN).is_err());
    }

    #[test]
    fn wifi_uses_the_standard_format() {
        let payload = CodePayload::Wifi {
            ssid: ssid("home"),
            auth: WifiAuth::Wpa {
                password: "secret".to_string(),
            },
            hidden: false,
        };
        assert_eq!(payload.encode(), "WIFI:T:WPA;S:home;P:secret;H:false;;");
    }

    #[test]
    fn wifi_without_a_password_uses_nopass() {
        let payload = CodePayload::Wifi {
            ssid: ssid("guest"),
            auth: WifiAuth::Nopass,
            hidden: true,
        };
        assert_eq!(payload.encode(), "WIFI:T:nopass;S:guest;P:;H:true;;");
    }

    /// 退避を忘れると、SSID の `;` が設定の区切りとして読まれてしまう。
    #[test]
    fn wifi_escapes_characters_that_would_change_the_meaning() {
        let payload = CodePayload::Wifi {
            ssid: ssid(r#"a;b,c:d"e\f"#),
            auth: WifiAuth::Wpa {
                password: "p;w".to_string(),
            },
            hidden: false,
        };
        assert_eq!(
            payload.encode(),
            r#"WIFI:T:WPA;S:a\;b\,c\:d\"e\\f;P:p\;w;H:false;;"#
        );
    }

    #[test]
    fn describes_itself_for_screen_readers() {
        let url = HttpUrl::parse("https://example.com").expect("valid url");
        assert_eq!(
            CodePayload::Url { url }.describe(),
            "URL: https://example.com"
        );
        assert_eq!(
            CodePayload::Wifi {
                ssid: ssid("home"),
                auth: WifiAuth::Nopass,
                hidden: false
            }
            .describe(),
            "Wi-Fi 設定: home"
        );
    }
}
