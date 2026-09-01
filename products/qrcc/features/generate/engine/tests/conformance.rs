//! TS(`@qrcc/generate/contract`) と Rust(`qrcc-generate`) が同じワイヤ形式を
//! 使うことを、`features/generate/fixtures/render-cases.json` で検証する。
//!
//! Rust 側は実際に生成し、TS 側は同じ JSON を組み立てられることを確かめる
//! （`features/generate/contract/conformance.test.ts`）。
#![allow(
    clippy::expect_used,
    clippy::unwrap_used,
    clippy::panic,
    clippy::indexing_slicing
)]

use std::fs;
use std::path::PathBuf;

use qrcc_generate::{RenderRequest, render};
use serde_json::Value;

fn cases() -> Vec<Value> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../fixtures/render-cases.json");
    let raw = fs::read_to_string(&path)
        .unwrap_or_else(|cause| panic!("cannot read {}: {cause}", path.display()));
    let fixture: Value = serde_json::from_str(&raw).expect("fixture must be valid JSON");
    fixture["cases"]
        .as_array()
        .expect("cases must be an array")
        .clone()
}

#[test]
fn every_fixture_request_deserializes_and_renders_as_expected() {
    for case in cases() {
        let name = case["name"].as_str().expect("name");
        let request: RenderRequest = serde_json::from_value(case["request"].clone())
            .unwrap_or_else(|cause| panic!("{name}: request must deserialize: {cause}"));

        let expected_ok = case["expect"]["ok"].as_bool().expect("expect.ok");
        let outcome = render(&request);
        assert_eq!(outcome.is_ok(), expected_ok, "{name}");

        match outcome {
            Ok(response) => {
                assert_eq!(
                    response.description,
                    case["expect"]["description"].as_str().expect("description"),
                    "{name}"
                );
                let expected_warnings: Vec<&str> = case["expect"]["warnings"]
                    .as_array()
                    .expect("warnings")
                    .iter()
                    .map(|warning| warning.as_str().expect("warning kind"))
                    .collect();
                let actual_warnings: Vec<String> = response
                    .warnings
                    .iter()
                    .map(|warning| {
                        serde_json::to_value(warning).expect("serializable")["kind"]
                            .as_str()
                            .expect("kind")
                            .to_owned()
                    })
                    .collect();
                assert_eq!(actual_warnings, expected_warnings, "{name}");
                assert!(response.body.starts_with("<svg"), "{name}");
                assert!(response.width > 0 && response.height > 0, "{name}");
            }
            Err(error) => {
                let serialized = serde_json::to_value(&error).expect("serializable");
                assert_eq!(
                    serialized["kind"].as_str(),
                    case["expect"]["errorKind"].as_str(),
                    "{name}"
                );
            }
        }
    }
}
