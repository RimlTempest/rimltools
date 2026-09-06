/**
 * 本文に対する指摘。構文エラーの位置と直し方をユーザーに見せるための値。
 *
 * 行・列は **1 始まり**（エディタの行番号表示と一致させる）。
 * `docs/accessibility.md` §2 の 3.3.1 に従い、`message`（何が悪いか）と
 * `hint`（どう直すか）を分けて持つ。
 */
import type { DocumentKind } from '@noter/contract'

export type DiagnosticSeverity = 'error' | 'warning'

/** どの解釈系が出した指摘か。mermaid は Markdown の中の図ブロック。 */
export type DiagnosticSource = DocumentKind | 'mermaid'

export type Diagnostic = {
  readonly severity: DiagnosticSeverity
  /** 1 始まりの行番号。 */
  readonly line: number
  /** 1 始まりの列番号（UTF-16 コードユニット単位）。 */
  readonly column: number
  readonly message: string
  readonly hint?: string
  readonly source: DiagnosticSource
}
