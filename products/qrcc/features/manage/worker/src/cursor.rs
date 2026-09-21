//! 一覧のカーソル（keyset pagination）。
//!
//! **`OFFSET` を使わない。** 何ページ目でも読む行数が一定になり、
//! D1 の行読み取り無料枠を守れる（docs/free-tier-budget.md）。
//!
//! カーソルは「どの並べ替えで発行したか」を必ず持つ。並べ替えを変えたのに
//! 古いカーソルで続きを読むと、飛ばされる行と重複する行が出るため、
//! 食い違いは黙って直さずエラーにする。

use qrcc_kernel::CodeId;
use serde::{Deserialize, Serialize};

/// 並べ替え。TS 側の `CodeSort` と同じ文字列。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CodeSort {
    #[default]
    UpdatedDesc,
    UpdatedAsc,
    NameAsc,
    NameDesc,
}

impl CodeSort {
    /// 並べ替えキーの列名。カーソルの比較にもそのまま使う。
    pub fn key_column(self) -> &'static str {
        match self {
            Self::UpdatedDesc | Self::UpdatedAsc => "updated_at",
            Self::NameAsc | Self::NameDesc => "name",
        }
    }

    /// 昇順か。カーソルの比較演算子と `ORDER BY` の向きを決める。
    pub fn ascending(self) -> bool {
        matches!(self, Self::UpdatedAsc | Self::NameAsc)
    }

    /// カーソルに載せる合言葉。`Serialize` に頼らず、短く安定した名前にする。
    pub fn as_str(self) -> &'static str {
        match self {
            Self::UpdatedDesc => "updated_desc",
            Self::UpdatedAsc => "updated_asc",
            Self::NameAsc => "name_asc",
            Self::NameDesc => "name_desc",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "updated_desc" => Some(Self::UpdatedDesc),
            "updated_asc" => Some(Self::UpdatedAsc),
            "name_asc" => Some(Self::NameAsc),
            "name_desc" => Some(Self::NameDesc),
            _ => None,
        }
    }
}

/// 「ここまで読んだ」を表す位置。並べ替えキーだけでは同値の行で止まれないので、
/// 必ず id と組にする。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Cursor {
    pub sort: CodeSort,
    pub id: CodeId,
    /// 並べ替えキーの値。更新順なら Unix 秒の 10 進表記、名前順なら名前そのもの。
    pub key: String,
}

const SEPARATOR: char = ':';

impl Cursor {
    /// `<並べ替え>:<id>:<キー>`。
    ///
    /// キーを最後に置くのは、名前に区切り文字が入っていても壊れないようにするため
    /// （前 2 つは形が決まっていて区切り文字を含まない）。
    pub fn encode(&self) -> String {
        format!(
            "{}{SEPARATOR}{}{SEPARATOR}{}",
            self.sort.as_str(),
            self.id.as_str(),
            self.key
        )
    }

    pub fn decode(raw: &str) -> Option<Self> {
        let mut parts = raw.splitn(3, SEPARATOR);
        let sort = CodeSort::parse(parts.next()?)?;
        let id = CodeId::parse(parts.next()?).ok()?;
        let key = parts.next()?.to_string();
        Some(Self { sort, id, key })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn code_id() -> CodeId {
        CodeId::parse("cd_0123456789abcdefghjkmnpq").expect("fixture")
    }

    #[test]
    fn round_trips_through_encoding() {
        let cursor = Cursor {
            sort: CodeSort::UpdatedDesc,
            id: code_id(),
            key: "1788220800".to_string(),
        };
        assert_eq!(Cursor::decode(&cursor.encode()), Some(cursor));
    }

    /// 名前順のキーは利用者が付けた文字列なので、区切り文字も改行も入りうる。
    #[test]
    fn survives_a_key_that_contains_the_separator() {
        let cursor = Cursor {
            sort: CodeSort::NameAsc,
            id: code_id(),
            key: "10:30 の棚:ラベル".to_string(),
        };
        assert_eq!(Cursor::decode(&cursor.encode()), Some(cursor));
    }

    #[test]
    fn refuses_a_malformed_cursor() {
        for raw in [
            "",
            "updated_desc",
            "updated_desc:cd_0123456789abcdefghjkmnpq",
            "nope:cd_0123456789abcdefghjkmnpq:1",
            "updated_desc:usr_0123456789abcdefghjkmnpq:1",
        ] {
            assert_eq!(Cursor::decode(raw), None, "cursor: {raw:?}");
        }
    }

    #[test]
    fn describes_the_column_and_direction_of_each_sort() {
        assert_eq!(CodeSort::UpdatedDesc.key_column(), "updated_at");
        assert!(!CodeSort::UpdatedDesc.ascending());
        assert_eq!(CodeSort::NameAsc.key_column(), "name");
        assert!(CodeSort::NameAsc.ascending());
    }

    #[test]
    fn every_sort_round_trips_through_its_name() {
        for sort in [
            CodeSort::UpdatedDesc,
            CodeSort::UpdatedAsc,
            CodeSort::NameAsc,
            CodeSort::NameDesc,
        ] {
            assert_eq!(CodeSort::parse(sort.as_str()), Some(sort));
        }
    }
}
