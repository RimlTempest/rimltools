//! D1 を使うための最小の入口。
//!
//! 型はここ（利用側）で定義する。おかげで判断を持つモジュールは `worker` を
//! 知らずに済み、テストではインメモリのフェイクを渡せる。
//! 失敗は投げずに値で返す — D1 は制約違反でも例外を投げるので、
//! それを `Result` に変える場所を 1 つに決めておく。

use serde_json::{Map, Value};

/// D1 の 1 行。列名 → 値。
pub type Row = Map<String, Value>;

/// 束縛できる値。D1 が受け付ける型のうち、ここで使うものだけ。
#[derive(Debug, Clone, PartialEq)]
pub enum Param {
    Text(String),
    Int(i64),
    Null,
}

impl Param {
    pub fn text(value: impl Into<String>) -> Self {
        Self::Text(value.into())
    }

    /// `None` を SQL の NULL にする。「未設定」を空文字で表さない。
    pub fn opt_text(value: Option<impl Into<String>>) -> Self {
        match value {
            Some(text) => Self::Text(text.into()),
            None => Self::Null,
        }
    }

    pub fn opt_int(value: Option<i64>) -> Self {
        match value {
            Some(number) => Self::Int(number),
            None => Self::Null,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Statement {
    pub sql: String,
    pub params: Vec<Param>,
}

impl Statement {
    pub fn new(sql: impl Into<String>, params: Vec<Param>) -> Self {
        Self {
            sql: sql.into(),
            params,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("storage unavailable: {detail}")]
pub struct StoreError {
    pub detail: String,
}

impl StoreError {
    pub fn new(detail: impl Into<String>) -> Self {
        Self {
            detail: detail.into(),
        }
    }
}

/// 読み書きの入口。
///
/// `write` が複数文を受け取るのは、所有権の確認と更新のように
/// 「途中まで成功した」状態を作りたくない組を 1 トランザクションで流すため。
#[allow(async_fn_in_trait)]
pub trait Sql {
    async fn all(&self, statement: &Statement) -> Result<Vec<Row>, StoreError>;

    /// 文ごとの変更行数を返す。所有権の確認を `WHERE` に畳んでいるので、
    /// 「0 行だった」がそのまま「無いか、自分のものではない」を意味する。
    async fn write(&self, statements: &[Statement]) -> Result<Vec<u32>, StoreError>;
}
