/**
 * 画面で使うゲストの制約の数値。
 *
 * サーバ設定（`@rimltools/auth/server` の `GUEST_SESSION_DAYS`）と同じ値だが、
 * UI がサーバ側モジュールを import しないよう、ここで持つ。
 * ずれないことは `guest-guide.test.ts` が確かめる。
 */
export const GUEST_SESSION_DAYS = 30
