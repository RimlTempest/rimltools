//! `handle` の振る舞い。実物の D1 も Worker も起動せず、フェイクの `Sql` で回す。
//!
//! 見ているのは「どんな SQL が流れたか」ではなく **「何が守られているか」**:
//! 未サインインを断る／他人のものに触らせない／同じ鍵の再送で 2 件作らない。
//! ただし所有権の確認は `WHERE` に畳んであるので、そこだけは文面も確かめる。

use qrcc_kernel::CommonRpcError;
use qrcc_kernel::UserId;
use serde_json::{Map, Value, json};

use crate::store::Row;
use crate::testing::{FakeSql, block_on};
use crate::{ManageRequest, handle};

const NOW: i64 = 1_788_307_200;
const OWNER: &str = "usr_0123456789abcdefghjkmnpq";
const CODE: &str = "cd_0123456789abcdefghjkmnpq";
const OTHER_CODE: &str = "cd_0123456789abcdefghjkmnpr";
const FOLDER: &str = "fld_0123456789abcdefghjkmnpq";
const TOKEN: &str = "abcdefghjkmnpqrstvwxyz0123456789";

fn owner() -> UserId {
    UserId::parse(OWNER).expect("fixture")
}

fn request<'a>(method: &'a str, body: &'a Value) -> ManageRequest<'a> {
    ManageRequest {
        method,
        actor: None,
        idempotency_key: None,
        body,
        now: NOW,
    }
}

fn row(pairs: &[(&str, Value)]) -> Row {
    let mut row = Map::new();
    for (key, value) in pairs {
        row.insert((*key).to_string(), value.clone());
    }
    row
}

fn code_row(id: &str, name: &str, updated_at: i64) -> Row {
    row(&[
        ("id", json!(id)),
        ("owner_id", json!(OWNER)),
        ("folder_id", Value::Null),
        ("name", json!(name)),
        ("kind", json!("qr")),
        ("payload", json!(r#"{"kind":"text","text":"ABC"}"#)),
        ("symbology", json!(r#"{"kind":"qr","ec":"M"}"#)),
        ("style", json!(r#"{"scale":6}"#)),
        ("created_at", json!(1_788_220_800_i64)),
        ("updated_at", json!(updated_at)),
    ])
}

fn summary_row(id: &str, name: &str, updated_at: i64) -> Row {
    row(&[
        ("id", json!(id)),
        ("name", json!(name)),
        ("kind", json!("qr")),
        ("folder_id", Value::Null),
        ("updated_at", json!(updated_at)),
    ])
}

fn list_body(limit: u32) -> Value {
    json!({ "folder_id": null, "query": null, "sort": "updated_desc", "limit": limit, "cursor": null })
}

fn draft_body() -> Value {
    json!({
        "id": CODE,
        "name": "在庫ラベル",
        "folder_id": null,
        "payload": { "kind": "text", "text": "ABC" },
        "symbology": { "kind": "qr", "ec": "M" },
        "style": { "scale": 6 }
    })
}

fn share_body() -> Value {
    json!({
        "code_id": CODE,
        "token": TOKEN,
        "permission": "view",
        "expires_at": 1_790_899_200_i64
    })
}

/// 保存・一覧・共有はすべて所有者が要る（ADR-0004）。
#[test]
fn every_owning_method_refuses_an_anonymous_caller() {
    for (method, body) in [
        ("codes.list", list_body(20)),
        ("codes.get", json!({ "id": CODE })),
        ("codes.create", draft_body()),
        ("codes.update", draft_body()),
        ("codes.delete", json!({ "id": CODE })),
        ("folders.list", json!({})),
        ("folders.create", json!({ "id": FOLDER, "name": "仕事" })),
        ("folders.update", json!({ "id": FOLDER, "name": "仕事" })),
        ("folders.delete", json!({ "id": FOLDER })),
        ("shares.create", share_body()),
        ("shares.revoke", json!({ "token": TOKEN })),
    ] {
        let sql = FakeSql::new();
        let outcome = block_on(handle(&sql, &request(method, &body)));
        assert_eq!(
            outcome,
            Err(CommonRpcError::Unauthorized),
            "method: {method}"
        );
        assert!(sql.statements().is_empty(), "method: {method} touched D1");
    }
}

#[test]
fn an_unknown_method_is_not_found() {
    let sql = FakeSql::new();
    let body = json!({});
    let outcome = block_on(handle(&sql, &request("codes.archive", &body)));
    assert_eq!(
        outcome,
        Err(CommonRpcError::NotFound {
            resource: "method codes.archive".to_string()
        })
    );
}

#[test]
fn the_method_list_and_the_dispatch_agree() {
    let sql = FakeSql::new();
    let body = json!({});
    for method in crate::METHODS {
        assert!(crate::handles(method), "method: {method}");
        let outcome = block_on(handle(&sql, &request(method, &body)));
        // 本文が空なので成功はしないが、「メソッドが無い」にはならない
        assert_ne!(
            outcome,
            Err(CommonRpcError::NotFound {
                resource: format!("method {method}")
            }),
            "method: {method}"
        );
    }
    assert!(!crate::handles("render"));
}

// ---- codes.list -----------------------------------------------------------

#[test]
fn lists_the_page_and_stops_when_there_is_nothing_more() {
    let sql = FakeSql::new().read(vec![summary_row(CODE, "在庫ラベル", NOW)]);
    let body = list_body(20);
    let mut call = request("codes.list", &body);
    let actor = owner();
    call.actor = Some(&actor);

    let page = block_on(handle(&sql, &call)).expect("lists");
    assert_eq!(page["items"].as_array().map(Vec::len), Some(1));
    assert_eq!(page["items"][0]["name"], json!("在庫ラベル"));
    assert_eq!(page["next_cursor"], Value::Null);
}

/// 上限より 1 行多く読み、余った 1 行は返さずにカーソルだけを作る。
#[test]
fn hands_back_a_cursor_only_when_another_page_exists() {
    let rows = vec![
        summary_row(CODE, "1 番目", NOW),
        summary_row(OTHER_CODE, "2 番目", NOW - 1),
        summary_row("cd_0123456789abcdefghjkmnps", "3 番目", NOW - 2),
    ];
    let sql = FakeSql::new().read(rows);
    let body = list_body(2);
    let mut call = request("codes.list", &body);
    let actor = owner();
    call.actor = Some(&actor);

    let page = block_on(handle(&sql, &call)).expect("lists");
    assert_eq!(page["items"].as_array().map(Vec::len), Some(2));
    assert_eq!(
        page["next_cursor"],
        json!(format!("updated_desc:{OTHER_CODE}:{}", NOW - 1))
    );
}

#[test]
fn scopes_the_list_to_the_caller() {
    let sql = FakeSql::new();
    let body = list_body(20);
    let mut call = request("codes.list", &body);
    let actor = owner();
    call.actor = Some(&actor);

    block_on(handle(&sql, &call)).expect("lists");
    let statement = sql.statements().into_iter().next().expect("one statement");
    assert!(statement.sql.contains("owner_id = ?"));
    assert!(statement.params.contains(&crate::Param::text(OWNER)));
}

// ---- codes.get ------------------------------------------------------------

#[test]
fn returns_the_code_together_with_its_live_share_links() {
    let shares = vec![row(&[
        ("token", json!(TOKEN)),
        ("code_id", json!(CODE)),
        ("permission", json!("view")),
        ("expires_at", json!(1_790_899_200_i64)),
        ("created_at", json!(NOW)),
        ("revoked_at", Value::Null),
    ])];
    let sql = FakeSql::new()
        .read(vec![code_row(CODE, "在庫ラベル", NOW)])
        .read(shares);
    let body = json!({ "id": CODE });
    let mut call = request("codes.get", &body);
    let actor = owner();
    call.actor = Some(&actor);

    let detail = block_on(handle(&sql, &call)).expect("gets");
    assert_eq!(detail["code"]["name"], json!("在庫ラベル"));
    // JSON 1 列はパースして返す（画面で二重にパースさせない）
    assert_eq!(detail["code"]["payload"]["text"], json!("ABC"));
    assert_eq!(detail["shares"].as_array().map(Vec::len), Some(1));
    // 取り消し済みは出さない
    assert!(sql.sql_texts()[1].contains("revoked_at IS NULL"));
}

/// 他人のコードは「無い」と答える。存在の有無を漏らさない。
#[test]
fn hides_a_code_that_is_not_the_callers() {
    let sql = FakeSql::new();
    let body = json!({ "id": CODE });
    let mut call = request("codes.get", &body);
    let actor = owner();
    call.actor = Some(&actor);

    assert_eq!(
        block_on(handle(&sql, &call)),
        Err(CommonRpcError::NotFound {
            resource: "code".to_string()
        })
    );
}

// ---- codes.create ---------------------------------------------------------

#[test]
fn creates_a_code_and_answers_with_what_was_written() {
    let sql = FakeSql::new();
    let body = draft_body();
    let mut call = request("codes.create", &body);
    let actor = owner();
    call.actor = Some(&actor);

    let created = block_on(handle(&sql, &call)).expect("creates");
    assert_eq!(created["id"], json!(CODE));
    assert_eq!(created["owner_id"], json!(OWNER));
    assert_eq!(created["kind"], json!("qr"));
    assert_eq!(created["created_at"], json!(NOW));
    assert_eq!(created["updated_at"], json!(NOW));
    // 書いた内容は分かっているので、確認のためだけに読み直さない
    assert_eq!(sql.statements().len(), 1);
}

/// 同じ Idempotency-Key の再送で 2 件目を作らない（docs/api-contract.md 5 節）。
#[test]
fn returns_the_existing_code_when_the_same_idempotency_key_comes_back() {
    let sql = FakeSql::new().read(vec![code_row(OTHER_CODE, "先に作られたもの", NOW)]);
    let body = draft_body();
    let mut call = request("codes.create", &body);
    let actor = owner();
    call.actor = Some(&actor);
    call.idempotency_key = Some("key-1");

    let created = block_on(handle(&sql, &call)).expect("creates");
    // 送った id ではなく、既にある id が返る
    assert_eq!(created["id"], json!(OTHER_CODE));
    assert_eq!(sql.sql_texts().len(), 1, "INSERT を流してはいけない");
    assert!(sql.sql_texts()[0].contains("idempotency_key = ?"));
}

/// 同時に 2 本走ると、後から来たほうの INSERT が一意制約に当たる。
/// 例外文字列を読まずに、鍵で拾い直して同じ答えを返す。
#[test]
fn recovers_the_existing_code_when_the_insert_races_and_fails() {
    let sql = FakeSql::new()
        .read(vec![])
        .write_failure("UNIQUE constraint failed: code.idempotency_key")
        .read(vec![code_row(OTHER_CODE, "先に作られたもの", NOW)]);
    let body = draft_body();
    let mut call = request("codes.create", &body);
    let actor = owner();
    call.actor = Some(&actor);
    call.idempotency_key = Some("key-1");

    let created = block_on(handle(&sql, &call)).expect("creates");
    assert_eq!(created["id"], json!(OTHER_CODE));
}

/// 鍵がなければ拾い直しようがない。失敗をなかったことにしない。
#[test]
fn reports_a_failed_insert_when_there_is_no_idempotency_key() {
    let sql = FakeSql::new().write_failure("disk is on fire");
    let body = draft_body();
    let mut call = request("codes.create", &body);
    let actor = owner();
    call.actor = Some(&actor);

    assert_eq!(block_on(handle(&sql, &call)), Err(CommonRpcError::Internal));
}

#[test]
fn refuses_to_file_a_code_into_someone_elses_folder() {
    let sql = FakeSql::new().read(vec![]);
    let mut body = draft_body();
    body["folder_id"] = json!(FOLDER);
    let mut call = request("codes.create", &body);
    let actor = owner();
    call.actor = Some(&actor);

    assert_eq!(
        block_on(handle(&sql, &call)),
        Err(CommonRpcError::NotFound {
            resource: "folder".to_string()
        })
    );
    assert_eq!(sql.statements().len(), 1, "INSERT を流してはいけない");
}

// ---- codes.update / delete ------------------------------------------------

#[test]
fn updates_only_the_callers_own_code() {
    let sql = FakeSql::new().write_changes(vec![1]);
    let body = draft_body();
    let mut call = request("codes.update", &body);
    let actor = owner();
    call.actor = Some(&actor);

    let updated = block_on(handle(&sql, &call)).expect("updates");
    assert_eq!(updated["updated_at"], json!(NOW));
    let statement = sql.statements().into_iter().next().expect("one statement");
    assert!(statement.sql.contains("WHERE id = ? AND owner_id = ?"));
}

#[test]
fn reports_not_found_when_the_update_changes_nothing() {
    let sql = FakeSql::new().write_changes(vec![0]);
    let body = draft_body();
    let mut call = request("codes.update", &body);
    let actor = owner();
    call.actor = Some(&actor);

    assert_eq!(
        block_on(handle(&sql, &call)),
        Err(CommonRpcError::NotFound {
            resource: "code".to_string()
        })
    );
}

#[test]
fn deletes_only_the_callers_own_code() {
    let sql = FakeSql::new().write_changes(vec![1]);
    let body = json!({ "id": CODE });
    let mut call = request("codes.delete", &body);
    let actor = owner();
    call.actor = Some(&actor);

    assert_eq!(
        block_on(handle(&sql, &call)).expect("deletes")["id"],
        json!(CODE)
    );
    let statement = sql.statements().into_iter().next().expect("one statement");
    assert!(
        statement
            .sql
            .starts_with("DELETE FROM code WHERE id = ? AND owner_id = ?")
    );

    let missing = FakeSql::new().write_changes(vec![0]);
    assert_eq!(
        block_on(handle(&missing, &call)),
        Err(CommonRpcError::NotFound {
            resource: "code".to_string()
        })
    );
}

// ---- folders --------------------------------------------------------------

#[test]
fn lists_folders_by_name() {
    let sql = FakeSql::new().read(vec![row(&[
        ("id", json!(FOLDER)),
        ("name", json!("仕事")),
        ("updated_at", json!(NOW)),
    ])]);
    let body = json!({});
    let mut call = request("folders.list", &body);
    let actor = owner();
    call.actor = Some(&actor);

    let folders = block_on(handle(&sql, &call)).expect("lists");
    assert_eq!(folders["items"][0]["name"], json!("仕事"));
    assert!(sql.sql_texts()[0].contains("ORDER BY name ASC"));
}

#[test]
fn renames_and_removes_only_the_callers_own_folder() {
    for (method, body) in [
        ("folders.update", json!({ "id": FOLDER, "name": "私用" })),
        ("folders.delete", json!({ "id": FOLDER })),
    ] {
        let sql = FakeSql::new().write_changes(vec![0]);
        let mut call = request(method, &body);
        let actor = owner();
        call.actor = Some(&actor);
        assert_eq!(
            block_on(handle(&sql, &call)),
            Err(CommonRpcError::NotFound {
                resource: "folder".to_string()
            }),
            "method: {method}"
        );
        assert!(
            sql.sql_texts()[0].contains("owner_id = ?"),
            "method: {method}"
        );
    }
}

// ---- shares ---------------------------------------------------------------

#[test]
fn creates_a_share_link_for_a_code_the_caller_owns() {
    let sql = FakeSql::new().read(vec![row(&[("id", json!(CODE))])]);
    let body = share_body();
    let mut call = request("shares.create", &body);
    let actor = owner();
    call.actor = Some(&actor);

    let share = block_on(handle(&sql, &call)).expect("creates");
    assert_eq!(share["token"], json!(TOKEN));
    assert_eq!(share["permission"], json!("view"));
    assert_eq!(share["expires_at"], json!(1_790_899_200_i64));
    assert_eq!(share["revoked_at"], Value::Null);
}

#[test]
fn refuses_to_share_a_code_the_caller_does_not_own() {
    let sql = FakeSql::new().read(vec![]);
    let body = share_body();
    let mut call = request("shares.create", &body);
    let actor = owner();
    call.actor = Some(&actor);

    assert_eq!(
        block_on(handle(&sql, &call)),
        Err(CommonRpcError::NotFound {
            resource: "code".to_string()
        })
    );
}

#[test]
fn returns_the_existing_share_when_the_same_idempotency_key_comes_back() {
    let sql = FakeSql::new().read(vec![row(&[
        ("token", json!(TOKEN)),
        ("code_id", json!(CODE)),
        ("permission", json!("view")),
        ("expires_at", Value::Null),
        ("created_at", json!(NOW)),
        ("revoked_at", Value::Null),
    ])]);
    let body = share_body();
    let mut call = request("shares.create", &body);
    let actor = owner();
    call.actor = Some(&actor);
    call.idempotency_key = Some("key-1");

    let share = block_on(handle(&sql, &call)).expect("creates");
    assert_eq!(share["token"], json!(TOKEN));
    assert_eq!(sql.sql_texts().len(), 1, "INSERT を流してはいけない");
}

/// 取り消しは行を消さずに印を付ける。二度目は「無い」と答える。
#[test]
fn revokes_a_live_link_and_refuses_a_second_revocation() {
    let sql = FakeSql::new().write_changes(vec![1]);
    let body = json!({ "token": TOKEN });
    let mut call = request("shares.revoke", &body);
    let actor = owner();
    call.actor = Some(&actor);

    let revoked = block_on(handle(&sql, &call)).expect("revokes");
    assert_eq!(revoked["revoked_at"], json!(NOW));
    let statement = sql.statements().into_iter().next().expect("one statement");
    assert!(statement.sql.contains("revoked_at IS NULL"));
    assert!(
        statement
            .sql
            .contains("SELECT id FROM code WHERE owner_id = ?")
    );

    let again = FakeSql::new().write_changes(vec![0]);
    assert_eq!(
        block_on(handle(&again, &call)),
        Err(CommonRpcError::NotFound {
            resource: "share".to_string()
        })
    );
}

/// 共有リンクの解決だけはサインイン不要（リンクを知っていることが鍵）。
#[test]
fn resolves_a_share_link_without_a_signed_in_caller() {
    let mut joined = code_row(CODE, "在庫ラベル", NOW);
    joined.insert("permission".to_string(), json!("view"));
    let sql = FakeSql::new().read(vec![joined]);
    let body = json!({ "token": TOKEN });

    let preview = block_on(handle(&sql, &request("shares.resolve", &body))).expect("resolves");
    assert_eq!(preview["permission"], json!("view"));
    assert_eq!(preview["code"]["name"], json!("在庫ラベル"));
}

/// 期限切れと取り消しは SQL の条件に畳む。読んでからアプリ側で弾く形にすると、
/// 判定を忘れた経路がそのまま漏洩になる。
#[test]
fn never_resolves_a_revoked_or_expired_link() {
    let sql = FakeSql::new().read(vec![]);
    let body = json!({ "token": TOKEN });

    assert_eq!(
        block_on(handle(&sql, &request("shares.resolve", &body))),
        Err(CommonRpcError::NotFound {
            resource: "share".to_string()
        })
    );
    let statement = sql.statements().into_iter().next().expect("one statement");
    assert!(statement.sql.contains("s.revoked_at IS NULL"));
    assert!(
        statement
            .sql
            .contains("s.expires_at IS NULL OR s.expires_at > ?")
    );
    assert!(statement.params.contains(&crate::Param::Int(NOW)));
}
