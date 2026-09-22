/**
 * 問題パネルに出す 1 行ぶん。
 *
 * `@noter/formats` の `Diagnostic` から、画面が要るぶんだけを写した構造。
 * plan 006 がプレビューと診断を差し込むまで、エディタは formats を知らない
 * （feature 同士の依存を先回りして作らない）。行・列は **1 始まり**。
 */
export type EditorDiagnostic = {
  readonly line: number
  readonly column: number
  readonly message: string
}
