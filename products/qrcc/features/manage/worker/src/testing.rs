//! テスト用のフェイク。実物の D1 も Worker も要らない。
//!
//! `block_on` を自前で持つのは、この crate に非同期ランタイムを足さないため。
//! フェイクは必ず即座に完了するので、1 回 poll すれば答えが出る。

use core::future::Future;
use core::task::{Context, Poll, Waker};
use std::cell::RefCell;
use std::collections::VecDeque;

use crate::store::{Row, Sql, Statement, StoreError};

/// 即座に完了する Future を 1 回の poll で解く。
pub fn block_on<T>(future: impl Future<Output = T>) -> T {
    let mut pinned = Box::pin(future);
    let mut context = Context::from_waker(Waker::noop());
    match pinned.as_mut().poll(&mut context) {
        Poll::Ready(value) => value,
        Poll::Pending => panic!("フェイクの Sql は待たずに完了するはず"),
    }
}

/// あらかじめ用意した答えを順に返し、流された SQL を記録する。
#[derive(Default)]
pub struct FakeSql {
    reads: RefCell<VecDeque<Vec<Row>>>,
    writes: RefCell<VecDeque<Result<Vec<u32>, StoreError>>>,
    log: RefCell<Vec<Statement>>,
}

impl FakeSql {
    pub fn new() -> Self {
        Self::default()
    }

    /// 次の `all` が返す行。足りなくなったら空を返す。
    pub fn read(self, rows: Vec<Row>) -> Self {
        self.reads.borrow_mut().push_back(rows);
        self
    }

    /// 次の `write` が返す変更行数。足りなくなったら 1 行変更したことにする。
    pub fn write_changes(self, changes: Vec<u32>) -> Self {
        self.writes.borrow_mut().push_back(Ok(changes));
        self
    }

    /// 次の `write` を失敗させる（一意制約に当たった場合など）。
    pub fn write_failure(self, detail: &str) -> Self {
        self.writes
            .borrow_mut()
            .push_back(Err(StoreError::new(detail)));
        self
    }

    /// 流れた SQL。SELECT と UPDATE の順序や条件を確かめるのに使う。
    pub fn statements(&self) -> Vec<Statement> {
        self.log.borrow().clone()
    }

    pub fn sql_texts(&self) -> Vec<String> {
        self.log
            .borrow()
            .iter()
            .map(|statement| statement.sql.clone())
            .collect()
    }
}

impl Sql for FakeSql {
    async fn all(&self, statement: &Statement) -> Result<Vec<Row>, StoreError> {
        self.log.borrow_mut().push(statement.clone());
        Ok(self.reads.borrow_mut().pop_front().unwrap_or_default())
    }

    async fn write(&self, statements: &[Statement]) -> Result<Vec<u32>, StoreError> {
        self.log.borrow_mut().extend(statements.iter().cloned());
        self.writes
            .borrow_mut()
            .pop_front()
            .unwrap_or_else(|| Ok(vec![1; statements.len()]))
    }
}
