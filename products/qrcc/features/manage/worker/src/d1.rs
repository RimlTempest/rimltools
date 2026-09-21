//! D1 バインディングの実装。**この crate で唯一 `worker` に依存する場所**。
//!
//! 判断（SQL の組み立て・行の読み取り・カーソル・入力検証）はここに書かない。
//! ここにあるのは「文と束縛値を D1 に渡し、結果を素の行に直す」だけで、
//! そのおかげで残り全部が Worker なしで単体テストできる。

use worker::d1::{D1Database, D1PreparedStatement, D1Type};

use crate::store::{Param, Row, Sql, Statement, StoreError};

fn failed(cause: worker::Error) -> StoreError {
    StoreError::new(cause.to_string())
}

/// 束縛値を D1 の型に写す。
///
/// 整数を `Real` で渡すのは、`D1Type::Integer` が i32 しか受けないため。
/// どちらも最終的には JS の number になるので表現は同じで、
/// 2038 年以降の Unix 秒でも欠けない。
fn to_d1(params: &[Param]) -> Vec<D1Type<'_>> {
    params
        .iter()
        .map(|param| match param {
            Param::Text(text) => D1Type::Text(text.as_str()),
            Param::Int(value) => D1Type::Real(*value as f64),
            Param::Null => D1Type::Null,
        })
        .collect()
}

pub struct D1Store {
    db: D1Database,
}

impl D1Store {
    pub fn new(db: D1Database) -> Self {
        Self { db }
    }

    fn prepare(&self, statement: &Statement) -> Result<D1PreparedStatement, StoreError> {
        let bound = to_d1(&statement.params);
        self.db
            .prepare(&statement.sql)
            .bind_refs(&bound)
            .map_err(failed)
    }
}

impl Sql for D1Store {
    async fn all(&self, statement: &Statement) -> Result<Vec<Row>, StoreError> {
        let outcome = self.prepare(statement)?.all().await.map_err(failed)?;
        outcome.results::<Row>().map_err(failed)
    }

    /// 複数文を **1 バッチ**で流す。所有権の確認と更新を分けて実行して
    /// 「途中まで成功した」状態を作らないため。
    async fn write(&self, statements: &[Statement]) -> Result<Vec<u32>, StoreError> {
        let mut prepared = Vec::with_capacity(statements.len());
        for statement in statements {
            prepared.push(self.prepare(statement)?);
        }
        let outcomes = self.db.batch(prepared).await.map_err(failed)?;

        let mut changes = Vec::with_capacity(outcomes.len());
        for outcome in &outcomes {
            let meta = outcome.meta().map_err(failed)?;
            changes.push(meta.and_then(|meta| meta.changes).unwrap_or_default() as u32);
        }
        Ok(changes)
    }
}
