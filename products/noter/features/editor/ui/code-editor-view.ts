/**
 * CodeMirror の EditorView を組み立てる（`code-editor.tsx` がブラウザでだけ読み込む）。
 *
 * CodeMirror・Lezer・y-codemirror はサーバの描画では使わない（SSR ではエディタの
 * 入れ物の `<div>` だけを返す）。静的に import すると Worker のバンドルに同梱されるので、
 * このモジュールに集め、`code-editor.tsx` から動的に読む（docs/bundle.md）。
 */
import { defaultKeymap } from '@codemirror/commands'
import { bracketMatching, indentOnInput } from '@codemirror/language'
import type { Diagnostic as LintDiagnostic } from '@codemirror/lint'
import { setDiagnostics } from '@codemirror/lint'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { EditorState } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view'
import type { DocumentKind } from '@noter/contract'
import { yCollab } from 'y-codemirror.next'
import type { Awareness } from 'y-protocols/awareness'
import type * as Y from 'yjs'
import type { EditorDiagnostic } from '../contract/diagnostic.ts'
import { describeImportError } from '../contract/import-error.ts'
import { byteLength, checkImportSize } from '../core/import-guard.ts'
import type { TextLines } from '../core/text-range.ts'
import { rangeAt } from '../core/text-range.ts'
import { languageOf } from './language.ts'
import { hiddenRemoteCursors } from './remote-cursors.ts'
import { noterTheme } from './theme.ts'

export type EditorViewOptions = {
  readonly parent: HTMLElement
  readonly ytext: Y.Text
  readonly awareness: Awareness
  readonly undoManager: Y.UndoManager
  readonly kind: DocumentKind
  readonly readOnly: boolean
  /** 上限を超える貼り付けを拒否したときの知らせ。 */
  readonly onNotice: (message: string) => void
}

export const createEditorView = ({
  parent,
  ytext,
  awareness,
  undoManager,
  kind,
  readOnly,
  onNotice,
}: EditorViewOptions): EditorView => {
  const guardPaste = EditorView.domEventHandlers({
    paste: (event, target) => {
      const pasted = event.clipboardData?.getData('text/plain') ?? ''
      if (pasted === '') return false
      const size = checkImportSize(byteLength(target.state.doc.toString()) + byteLength(pasted))
      if (size.ok) return false
      event.preventDefault()
      onNotice(describeImportError(size.error))
      return true
    },
  })

  return new EditorView({
    parent,
    state: EditorState.create({
      doc: ytext.toJSON(),
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        highlightSelectionMatches(),
        drawSelection(),
        bracketMatching(),
        indentOnInput(),
        EditorView.lineWrapping,
        keymap.of([
          {
            key: 'Mod-s',
            preventDefault: true,
            run: () => {
              onNotice('自動で同期されています')
              return true
            },
          },
          ...defaultKeymap,
          ...searchKeymap,
        ]),
        languageOf(kind),
        guardPaste,
        noterTheme,
        EditorView.contentAttributes.of({
          'aria-label': '本文',
          'aria-multiline': 'true',
        }),
        yCollab(ytext, awareness, { undoManager }),
        hiddenRemoteCursors,
        ...(readOnly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []),
      ],
    }),
  })
}

/** 指摘を波線と吹き出しにする。行・列は打鍵でずれるので、文書の中に収まるよう丸める。 */
export const showDiagnostics = (
  view: EditorView,
  diagnostics: readonly EditorDiagnostic[],
): void => {
  view.dispatch(setDiagnostics(view.state, toLintDiagnostics(view.state.doc, diagnostics)))
}

/** 1 始まりの行・列の位置へカーソルを置く。 */
export const cursorAt = (view: EditorView, line: number, column: number): number =>
  rangeAt(view.state.doc, line, column).from

/** 指摘をその行の範囲に置く。空行では長さ 0 になり、lint が印だけを出す。 */
const toLintDiagnostics = (
  doc: TextLines,
  diagnostics: readonly EditorDiagnostic[],
): readonly LintDiagnostic[] =>
  diagnostics.map((diagnostic) => {
    const range = rangeAt(doc, diagnostic.line, diagnostic.column)
    return { from: range.from, to: range.to, severity: 'error', message: diagnostic.message }
  })
