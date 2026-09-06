/**
 * @noter/formats の core — 本文の解析・診断。
 *
 * すべて純粋関数で、I/O も DOM も触らない（ブラウザで走らせても Worker の
 * リクエストを消費しない）。ライブラリの例外はここで `Result` に畳む。
 */
export type { Diagnostic, DiagnosticSeverity, DiagnosticSource } from '../contract/diagnostic.ts'
export type { JsonObject, JsonValue } from '../contract/json-value.ts'
export { diagnose } from './diagnose.ts'
export type { NormalizeError } from './normalize.ts'
export { toJsonValue } from './normalize.ts'
export type { ParseDiagnostics, ParsedDocument } from './parse.ts'
export { parseDocument } from './parse.ts'
export type { Position } from './position.ts'
export { positionAt } from './position.ts'
