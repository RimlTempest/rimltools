//! qrcc-kernel — 全 Rust crate が使う共有プリミティブ。
//!
//! TS 側の `@qrcc/contract` と対になる。両者は
//! `shared/kernel/fixtures/` の同じ JSON で検証され、
//! 表現がずれたらテストが落ちる。
//!
//! ここに I/O は書かない。`worker` crate にも依存しない（ADR-0003）。
#![forbid(unsafe_code)]
#![cfg_attr(test, allow(clippy::expect_used, clippy::unwrap_used, clippy::panic))]

pub mod base32;
pub mod id;
pub mod rpc;
pub mod text;

pub use base32::{CROCKFORD_BASE32_ALPHABET, encode_crockford_base32};
pub use id::{CodeId, FolderId, IdParseError, ShareToken, SpecHash, UserId};
pub use rpc::{CommonRpcError, RpcDecodeError, decode_envelope, encode_envelope};
pub use text::{EmailAddress, HexColor, HttpUrl, NonEmptyText, PhoneNumber, TextParseError};
