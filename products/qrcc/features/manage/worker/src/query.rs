//! 一覧の SQL を組み立てる純粋な部分。
//!
//! I/O を持たないので、Worker も D1 も起動せずに「どんな SQL が出るか」を
//! そのまま検証できる。カーソル・絞り込み・並べ替えの境界はここに閉じている。

use qrcc_kernel::{FolderId, UserId};

use crate::cursor::{CodeSort, Cursor};
use crate::store::{Param, Statement};

/// 1 ページの上限（docs/api-contract.md 6 節）。
pub const MAX_PAGE_SIZE: u32 = 50;
/// フォルダ一覧の上限。ネストしない設計なので、これを超える運用は想定しない。
pub const MAX_FOLDERS: u32 = 200;

/// 一覧に出す列。`payload` / `style` は開くまで読まない（行あたりの読み取りを減らす）。
pub const SUMMARY_COLUMNS: &str = "id, name, kind, folder_id, updated_at";
/// 1 件の詳細で読む列。
pub const CODE_COLUMNS: &str =
    "id, owner_id, folder_id, name, kind, payload, symbology, style, created_at, updated_at";

#[derive(Debug, Clone, PartialEq)]
pub struct ListQuery {
    pub owner: UserId,
    /// `None` は「フォルダで絞り込まない」。
    pub folder: Option<FolderId>,
    /// 名前の部分一致。空文字は絞り込まないのと同じ。
    pub query: Option<String>,
    pub sort: CodeSort,
    pub limit: u32,
    pub cursor: Option<Cursor>,
}

/// 1..=MAX_PAGE_SIZE に収める。上限を超える要求で D1 の行読み取りを浪費させない。
pub fn clamp_limit(limit: u32) -> u32 {
    limit.clamp(1, MAX_PAGE_SIZE)
}

/// `LIKE` のメタ文字を無効化する。利用者が入力した `%` を
/// 「全部に一致」として解釈しない。
pub fn escape_like(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for character in value.chars() {
        if matches!(character, '\\' | '%' | '_') {
            escaped.push('\\');
        }
        escaped.push(character);
    }
    escaped
}

/// 次のページがあるかを 1 回の問い合わせで知るため、上限より 1 行多く読む。
pub fn fetch_limit(limit: u32) -> u32 {
    clamp_limit(limit) + 1
}

fn order_by(sort: CodeSort) -> String {
    let direction = if sort.ascending() { "ASC" } else { "DESC" };
    format!("{} {direction}, id {direction}", sort.key_column())
}

/// カーソルより後ろだけを残す条件。
///
/// 並べ替えキーが同値の行で止まれるよう、必ず id との組で比較する。
/// `(key, id) > (?, ?)` を SQLite の行値比較ではなく素の論理式で書くのは、
/// 索引がそのまま効く形にしておくため。
fn cursor_predicate(sort: CodeSort, cursor: &Cursor, params: &mut Vec<Param>) -> String {
    let column = sort.key_column();
    let comparison = if sort.ascending() { ">" } else { "<" };
    let key = if column == "updated_at" {
        Param::Int(cursor.key.parse::<i64>().unwrap_or_default())
    } else {
        Param::text(cursor.key.clone())
    };
    params.push(key.clone());
    params.push(key);
    params.push(Param::text(cursor.id.as_str()));
    format!("({column} {comparison} ? OR ({column} = ? AND id {comparison} ?))")
}

/// 一覧の問い合わせ。上限より 1 行多く読むので、呼び出し側は
/// 「返ってきた行数 > 上限」で次ページの有無を判断できる。
pub fn list_statement(query: &ListQuery) -> Statement {
    let mut conditions = vec!["owner_id = ?".to_string()];
    let mut params = vec![Param::text(query.owner.as_str())];

    if let Some(folder) = &query.folder {
        conditions.push("folder_id = ?".to_string());
        params.push(Param::text(folder.as_str()));
    }
    if let Some(text) = query.query.as_deref().filter(|text| !text.is_empty()) {
        conditions.push("name LIKE ? ESCAPE '\\'".to_string());
        params.push(Param::text(format!("%{}%", escape_like(text))));
    }
    if let Some(cursor) = &query.cursor {
        conditions.push(cursor_predicate(query.sort, cursor, &mut params));
    }
    params.push(Param::Int(i64::from(fetch_limit(query.limit))));

    Statement::new(
        format!(
            "SELECT {SUMMARY_COLUMNS} FROM code WHERE {} ORDER BY {} LIMIT ?",
            conditions.join(" AND "),
            order_by(query.sort)
        ),
        params,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn owner() -> UserId {
        UserId::parse("usr_0123456789abcdefghjkmnpq").expect("fixture")
    }

    fn folder() -> FolderId {
        FolderId::parse("fld_0123456789abcdefghjkmnpq").expect("fixture")
    }

    fn base() -> ListQuery {
        ListQuery {
            owner: owner(),
            folder: None,
            query: None,
            sort: CodeSort::UpdatedDesc,
            limit: 20,
            cursor: None,
        }
    }

    #[test]
    fn reads_only_the_columns_the_list_shows() {
        let statement = list_statement(&base());
        assert!(
            statement
                .sql
                .starts_with(&format!("SELECT {SUMMARY_COLUMNS} FROM code"))
        );
        assert!(!statement.sql.contains("payload"));
        assert!(!statement.sql.contains("style"));
    }

    /// ページ数が増えても読む行数が増えないことが、この設計の要点。
    #[test]
    fn never_uses_offset() {
        let mut query = base();
        query.cursor = Some(Cursor {
            sort: CodeSort::UpdatedDesc,
            id: qrcc_kernel::CodeId::parse("cd_0123456789abcdefghjkmnpq").expect("fixture"),
            key: "1788220800".to_string(),
        });
        assert!(!list_statement(&query).sql.to_uppercase().contains("OFFSET"));
    }

    #[test]
    fn always_scopes_to_the_owner() {
        let statement = list_statement(&base());
        assert!(statement.sql.contains("owner_id = ?"));
        assert_eq!(
            statement.params.first(),
            Some(&Param::text(owner().as_str()))
        );
    }

    #[test]
    fn filters_by_folder_when_asked() {
        let mut query = base();
        query.folder = Some(folder());
        let statement = list_statement(&query);
        assert!(statement.sql.contains("folder_id = ?"));
        assert!(statement.params.contains(&Param::text(folder().as_str())));

        assert!(!list_statement(&base()).sql.contains("folder_id = ?"));
    }

    #[test]
    fn searches_the_name_by_partial_match() {
        let mut query = base();
        query.query = Some("ラベル".to_string());
        let statement = list_statement(&query);
        assert!(statement.sql.contains("name LIKE ? ESCAPE"));
        assert!(statement.params.contains(&Param::text("%ラベル%")));
    }

    /// 入力した `%` を「全部に一致」として扱わない。
    #[test]
    fn escapes_like_metacharacters_in_the_search() {
        assert_eq!(escape_like("100%_off\\"), "100\\%\\_off\\\\");
        let mut query = base();
        query.query = Some("50%".to_string());
        assert!(
            list_statement(&query)
                .params
                .contains(&Param::text("%50\\%%"))
        );
    }

    #[test]
    fn ignores_an_empty_search() {
        let mut query = base();
        query.query = Some(String::new());
        assert!(!list_statement(&query).sql.contains("LIKE"));
    }

    #[test]
    fn orders_by_the_requested_sort_and_breaks_ties_with_the_id() {
        let cases = [
            (CodeSort::UpdatedDesc, "ORDER BY updated_at DESC, id DESC"),
            (CodeSort::UpdatedAsc, "ORDER BY updated_at ASC, id ASC"),
            (CodeSort::NameAsc, "ORDER BY name ASC, id ASC"),
            (CodeSort::NameDesc, "ORDER BY name DESC, id DESC"),
        ];
        for (sort, expected) in cases {
            let mut query = base();
            query.sort = sort;
            assert!(
                list_statement(&query).sql.contains(expected),
                "sort: {sort:?}"
            );
        }
    }

    #[test]
    fn continues_after_the_cursor_in_the_sort_direction() {
        let cursor = Cursor {
            sort: CodeSort::UpdatedDesc,
            id: qrcc_kernel::CodeId::parse("cd_0123456789abcdefghjkmnpq").expect("fixture"),
            key: "1788220800".to_string(),
        };
        let mut query = base();
        query.cursor = Some(cursor.clone());
        let descending = list_statement(&query);
        assert!(
            descending
                .sql
                .contains("(updated_at < ? OR (updated_at = ? AND id < ?))")
        );
        assert!(descending.params.contains(&Param::Int(1_788_220_800)));

        query.sort = CodeSort::NameAsc;
        query.cursor = Some(Cursor {
            sort: CodeSort::NameAsc,
            key: "在庫ラベル".to_string(),
            ..cursor
        });
        let ascending = list_statement(&query);
        assert!(
            ascending
                .sql
                .contains("(name > ? OR (name = ? AND id > ?))")
        );
        assert!(ascending.params.contains(&Param::text("在庫ラベル")));
    }

    /// 次ページの有無を知るために 1 行だけ多く読む。2 回問い合わせない。
    #[test]
    fn reads_one_row_beyond_the_page_to_detect_the_next_page() {
        assert_eq!(fetch_limit(20), 21);
        let statement = list_statement(&base());
        assert!(statement.sql.ends_with("LIMIT ?"));
        assert_eq!(statement.params.last(), Some(&Param::Int(21)));
    }

    #[test]
    fn clamps_the_page_size_to_the_documented_limits() {
        assert_eq!(clamp_limit(0), 1);
        assert_eq!(clamp_limit(20), 20);
        assert_eq!(clamp_limit(50), 50);
        assert_eq!(clamp_limit(5_000), MAX_PAGE_SIZE);
    }
}
