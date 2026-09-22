//! qrcc-manage-worker — 保存されたコード・フォルダ・共有リンクの D1 CRUD。
//!
//! `features/<name>/worker` の規約どおり、`worker` crate に依存してよい層
//! （ADR-0007）。ただし依存しているのは `d1.rs` だけで、判断は全部
//! 純粋モジュール（`query` / `row` / `cursor` / `input` / `service`）にある。
//!
//! **認証も認可もここでは行わない。** 呼び出し元は qrcc-web だけで、
//! 検証済みの `UserId` がヘッダで渡ってくる前提に立つ（ADR-0002）。
//! ゲストの制約（編集権限・無期限の共有リンクを作れない）も qrcc-web の
//! 判断で、ここに書き写さない。
//!
//! この Worker が守るのは 1 つだけ:
//! **他人のデータに触らせない**（すべての文が `owner_id` で絞られている）。
#![forbid(unsafe_code)]
#![cfg_attr(
    test,
    allow(
        clippy::expect_used,
        clippy::unwrap_used,
        clippy::panic,
        clippy::indexing_slicing
    )
)]

pub mod codes;
pub mod cursor;
pub mod d1;
pub mod folders;
pub mod input;
pub mod query;
pub mod row;
pub mod service;
pub mod shares;
pub mod store;

#[cfg(test)]
mod rpc_tests;
#[cfg(test)]
mod testing;

use qrcc_kernel::CommonRpcError;
use serde_json::Value;

pub use d1::D1Store;
pub use service::ManageRequest;
pub use store::{Param, Row, Sql, Statement, StoreError};

/// この Worker が受け持つ RPC メソッド（docs/api-contract.md 2 節）。
///
/// 振り分けの分岐と一覧を 1 つの配列から作るので、「一覧にはあるが
/// 実装がない」が起きない。
pub const METHODS: &[&str] = &[
    "codes.list",
    "codes.get",
    "codes.create",
    "codes.update",
    "codes.delete",
    "folders.list",
    "folders.create",
    "folders.update",
    "folders.delete",
    "shares.create",
    "shares.revoke",
    "shares.resolve",
];

/// D1 が要るメソッドか。services/api はこれで経路を分ける。
pub fn handles(method: &str) -> bool {
    METHODS.contains(&method)
}

pub async fn handle<S: Sql>(sql: &S, request: &ManageRequest<'_>) -> Result<Value, CommonRpcError> {
    match request.method {
        "codes.list" => codes::list(sql, request).await,
        "codes.get" => codes::get(sql, request).await,
        "codes.create" => codes::create(sql, request).await,
        "codes.update" => codes::update(sql, request).await,
        "codes.delete" => codes::delete(sql, request).await,
        "folders.list" => folders::list(sql, request).await,
        "folders.create" => folders::create(sql, request).await,
        "folders.update" => folders::update(sql, request).await,
        "folders.delete" => folders::delete(sql, request).await,
        "shares.create" => shares::create(sql, request).await,
        "shares.revoke" => shares::revoke(sql, request).await,
        "shares.resolve" => shares::resolve(sql, request).await,
        unknown => Err(CommonRpcError::NotFound {
            resource: format!("method {unknown}"),
        }),
    }
}
