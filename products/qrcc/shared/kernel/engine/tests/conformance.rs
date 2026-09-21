//! TS(`@qrcc/contract`) と Rust(`qrcc-kernel`) が同じ判定をすることを、
//! `shared/kernel/fixtures/` の同じ JSON で検証する。
//!
//! TS 側の対になるテストは `shared/kernel/conformance/conformance.test.ts`。
//! どちらか一方だけを直すとこのテストが落ちる。
// フィクスチャは `case["kind"]` のように serde_json の Index で読む。
// 形が違えばテストが落ちるべきなので、ここでは添字アクセスを許可する。
#![allow(
    clippy::expect_used,
    clippy::unwrap_used,
    clippy::panic,
    clippy::indexing_slicing
)]

use std::fs;
use std::path::PathBuf;

use qrcc_kernel::{
    CodeId, CommonRpcError, EmailAddress, FolderId, HexColor, HttpUrl, NonEmptyText, PhoneNumber,
    ShareToken, SpecHash, UserId, encode_crockford_base32,
};
use serde_json::Value;

fn fixture(name: &str) -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../fixtures")
        .join(name);
    let raw = fs::read_to_string(&path)
        .unwrap_or_else(|cause| panic!("cannot read {}: {cause}", path.display()));
    serde_json::from_str(&raw).expect("fixture must be valid JSON")
}

fn cases(name: &str, key: &str) -> Vec<Value> {
    fixture(name)[key]
        .as_array()
        .expect("fixture must hold an array")
        .clone()
}

#[test]
fn base32_matches_the_shared_vectors() {
    for vector in cases("base32.json", "vectors") {
        let bytes: Vec<u8> = vector["bytes"]
            .as_array()
            .expect("bytes must be an array")
            .iter()
            .map(|b| u8::try_from(b.as_u64().expect("byte must be a number")).expect("0..=255"))
            .collect();
        let expected = vector["encoded"]
            .as_str()
            .expect("encoded must be a string");
        assert_eq!(
            encode_crockford_base32(&bytes),
            expected,
            "bytes: {bytes:?}"
        );
    }
}

#[test]
fn ids_match_the_shared_cases() {
    for case in cases("ids.json", "cases") {
        let kind = case["kind"].as_str().expect("kind must be a string");
        let value = case["value"].as_str().expect("value must be a string");
        let expected = case["valid"].as_bool().expect("valid must be a boolean");

        let actual = match kind {
            "user" => UserId::parse(value).is_ok(),
            "code" => CodeId::parse(value).is_ok(),
            "folder" => FolderId::parse(value).is_ok(),
            "share_token" => ShareToken::parse(value).is_ok(),
            "spec_hash" => SpecHash::parse(value).is_ok(),
            other => panic!("unknown id kind in fixture: {other}"),
        };
        assert_eq!(actual, expected, "{kind} {value:?}");
    }
}

#[test]
fn validated_text_matches_the_shared_cases() {
    for case in cases("text.json", "cases") {
        let kind = case["kind"].as_str().expect("kind must be a string");
        let value = case["value"].as_str().expect("value must be a string");
        let expected = case["valid"].as_bool().expect("valid must be a boolean");

        let actual = match kind {
            "non_empty_text" => NonEmptyText::parse(value).is_ok(),
            "http_url" => HttpUrl::parse(value).is_ok(),
            "email" => EmailAddress::parse(value).is_ok(),
            "phone" => PhoneNumber::parse(value).is_ok(),
            "hex_color" => HexColor::parse(value).is_ok(),
            other => panic!("unknown text kind in fixture: {other}"),
        };
        assert_eq!(actual, expected, "{kind} {value:?}");
    }
}

#[test]
fn common_rpc_errors_match_the_shared_cases() {
    for case in cases("rpc-errors.json", "cases") {
        let expected = case["valid"].as_bool().expect("valid must be a boolean");
        let decoded = serde_json::from_value::<CommonRpcError>(case["json"].clone());
        assert_eq!(decoded.is_ok(), expected, "{}", case["json"]);
    }
}
