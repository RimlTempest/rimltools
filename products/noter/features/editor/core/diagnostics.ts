/**
 * `@noter/formats` の指摘を、この画面が出す 1 行に写す。
 *
 * `docs/accessibility.md` §2 の 3.3.1 に従い、**何が悪いか**（message）だけで
 * 終わらせず**どう直すか**（hint）まで 1 つの文にして読み上げに載せる。
 */
import type { Diagnostic } from '@noter/formats/contract'
import type { EditorDiagnostic } from '../contract/diagnostic.ts'

export const toEditorDiagnostics = (
  diagnostics: readonly Diagnostic[],
): readonly EditorDiagnostic[] =>
  diagnostics.map((diagnostic) => ({
    line: diagnostic.line,
    column: diagnostic.column,
    message:
      diagnostic.hint === undefined
        ? diagnostic.message
        : `${diagnostic.message} ${diagnostic.hint}`,
  }))
