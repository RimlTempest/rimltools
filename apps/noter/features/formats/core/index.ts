/**
 * @noter/formats の core — 本文の解析・診断・整形・変換。
 *
 * すべて純粋関数で、I/O も DOM も触らない（ブラウザで走らせても Worker の
 * リクエストを消費しない）。ライブラリの例外はここで `Result` に畳む。
 */
export type { DataDocumentKind } from '../contract/data-kind.ts'
export { DATA_DOCUMENT_KINDS, isDataDocumentKind } from '../contract/data-kind.ts'
export type { Diagnostic, DiagnosticSeverity, DiagnosticSource } from '../contract/diagnostic.ts'
export type { JsonObject, JsonValue } from '../contract/json-value.ts'
export type { ConvertError } from './convert.ts'
export { convertDocument } from './convert.ts'
export { diagnose } from './diagnose.ts'
export type { FormatError } from './format.ts'
export { formatDocument, stringifyData } from './format.ts'
export type { MermaidBlock } from './mermaid-blocks.ts'
export { extractMermaidBlocks } from './mermaid-blocks.ts'
export type { NormalizeError } from './normalize.ts'
export { toJsonValue } from './normalize.ts'
export type { ParseDiagnostics, ParsedDocument } from './parse.ts'
export { parseDocument } from './parse.ts'
export type { Position } from './position.ts'
export { positionAt } from './position.ts'
export type { MermaidPlaceholderInput, RenderMarkdownDeps } from './render-markdown.ts'
export { defaultMermaidPlaceholder, renderMarkdown, slugify } from './render-markdown.ts'
