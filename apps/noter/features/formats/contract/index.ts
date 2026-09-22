/**
 * @noter/formats の契約。
 *
 * 「指摘（Diagnostic）」と「正規化した値（JsonValue）」だけを置く。
 * markdown-it / yaml / mermaid などの実装には依存しないので、
 * 問題パネルのような UI は core を読み込まずにこの型だけを import できる。
 */
export type { DataDocumentKind } from './data-kind.ts'
export { DATA_DOCUMENT_KINDS, isDataDocumentKind } from './data-kind.ts'
export type { Diagnostic, DiagnosticSeverity, DiagnosticSource } from './diagnostic.ts'
export type { JsonObject, JsonValue } from './json-value.ts'
