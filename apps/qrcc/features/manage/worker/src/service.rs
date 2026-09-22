//! 各メソッドが共通で使う判断。
//!
//! **所有権の確認は `WHERE owner_id = ?` に畳む。** 先に SELECT して比べる形に
//! すると、確認と更新の間に行が変わりうるうえ、読み取り行数も増える。
//! 「変更行数が 0」がそのまま「無いか、自分のものではない」を意味する。
//!
//! 無いものと他人のものを**同じ `not_found` で返す**のは、存在の有無を
//! 他人に漏らさないため（列挙攻撃で ID の当たりを付けられないようにする）。

use qrcc_kernel::{CommonRpcError, UserId};
use serde_json::Value;

use crate::store::StoreError;

/// 呼び出しの素材。時計も乱数もこの構造体で外から受け取る（この crate は持たない）。
pub struct ManageRequest<'a> {
    pub method: &'a str,
    /// qrcc-web が検証済みの呼び出し元。匿名なら `None`（ADR-0002）。
    pub actor: Option<&'a UserId>,
    /// 作成系の二重実行を防ぐ鍵（docs/api-contract.md 5 節）。
    pub idempotency_key: Option<&'a str>,
    pub body: &'a Value,
    /// 現在時刻（Unix 秒）。
    pub now: i64,
}

pub fn not_found(resource: &str) -> CommonRpcError {
    CommonRpcError::NotFound {
        resource: resource.to_string(),
    }
}

/// 保存層の失敗。利用者に見せられる情報はないので internal に畳む。
pub fn storage(_error: StoreError) -> CommonRpcError {
    CommonRpcError::Internal
}

pub fn require_actor<'a>(request: &ManageRequest<'a>) -> Result<&'a UserId, CommonRpcError> {
    request.actor.ok_or(CommonRpcError::Unauthorized)
}

/// JSON 1 列に入れる文字列。詰め替えないので、保存と読み出しで形がずれない。
pub fn to_column(value: &Value) -> Result<String, CommonRpcError> {
    serde_json::to_string(value).map_err(|_| CommonRpcError::Internal)
}

/// `write` が返す変更行数の 1 つ目。0 なら「無いか、自分のものではない」。
pub fn changed(changes: &[u32]) -> u32 {
    changes.first().copied().unwrap_or_default()
}
