import { useEffect, useRef, useState } from 'react'
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

/** 画面から本文を操作するための取っ手。取り込みと「その行へ移動」が使う。 */
export type EditorHandle = {
  readonly replaceAll: (text: string) => void
  readonly insertAtCursor: (text: string) => void
  /** 1 始まりの行・列へ移動してフォーカスする。 */
  readonly goTo: (line: number, column: number) => void
  readonly focus: () => void
}

type CodeEditorProps = {
  readonly ytext: Y.Text
  readonly awareness: Awareness
  readonly undoManager: Y.UndoManager
  readonly kind: DocumentKind
  readonly readOnly: boolean
  /** 本文に対する指摘。波線と吹き出しで、その場に出す。 */
  readonly diagnostics?: readonly EditorDiagnostic[]
  /** 画面にただ 1 つある live region へ流す。 */
  readonly onNotice: (message: string) => void
  /** 取っ手の受け渡し。破棄されるときは `undefined` で呼ぶ。 */
  readonly onReady?: (handle: EditorHandle | undefined) => void
}

/**
 * 本文のエディタ（docs/design/ux.md §4.2）。
 *
 * - **Tab をインデントに割り当てる拡張を入れない。** Tab はフォーカス移動の
 *   ままにして、エディタから抜けられなくならないようにする（AAA 2.1.2）
 * - アクセシブル名は自分で付ける（CodeMirror は `role="textbox"` と
 *   `aria-multiline` までしか付けない）
 * - 上限を超える貼り付けは拒否して理由を出す（黙って切り詰めない）
 * - `Cmd/Ctrl + S` は「押すものが無い」ことを伝えるだけ
 * - undo は Yjs の `UndoManager` に任せる。CodeMirror の `history()` を
 *   併用すると、他人の編集まで巻き戻す undo と二重に `Mod-z` を奪い合う
 * - 指摘（`diagnostics`）は `@codemirror/lint` に流す。行・列は打鍵で
 *   ずれるので、文書の中に収まるよう必ず丸める（`rangeAt`）
 */
export const CodeEditor = ({
  ytext,
  awareness,
  undoManager,
  kind,
  readOnly,
  diagnostics,
  onNotice,
  onReady,
}: CodeEditorProps) => {
  const hostRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<EditorView | undefined>(undefined)
  // 再生成の引き金にしたくない値は ref 経由で読む。書き込みは描画の外で行う
  const noticeRef = useRef(onNotice)
  const readyRef = useRef(onReady)

  useEffect(() => {
    noticeRef.current = onNotice
    readyRef.current = onReady
  }, [onNotice, onReady])

  useEffect(() => {
    const parent = hostRef.current
    if (parent === null) return

    const guardPaste = EditorView.domEventHandlers({
      paste: (event, target) => {
        const pasted = event.clipboardData?.getData('text/plain') ?? ''
        if (pasted === '') return false
        const size = checkImportSize(byteLength(target.state.doc.toString()) + byteLength(pasted))
        if (size.ok) return false
        event.preventDefault()
        noticeRef.current(describeImportError(size.error))
        return true
      },
    })

    const created = new EditorView({
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
                noticeRef.current('自動で同期されています')
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

    readyRef.current?.({
      replaceAll: (text) => {
        created.dispatch({ changes: { from: 0, to: created.state.doc.length, insert: text } })
      },
      insertAtCursor: (text) => {
        created.dispatch(created.state.replaceSelection(text))
      },
      goTo: (line, column) => {
        const { from } = rangeAt(created.state.doc, line, column)
        created.dispatch({ selection: { anchor: from }, scrollIntoView: true })
        created.focus()
      },
      focus: () => created.focus(),
    })

    // 「開いた瞬間に書ける」（ux.md §2 原則 1）。閲覧のみのときは奪わない
    if (!readOnly) created.focus()
    setView(created)

    return () => {
      readyRef.current?.(undefined)
      setView(undefined)
      created.destroy()
    }
  }, [ytext, awareness, undoManager, kind, readOnly])

  useEffect(() => {
    if (view === undefined) return
    view.dispatch(setDiagnostics(view.state, toLintDiagnostics(view.state.doc, diagnostics ?? [])))
  }, [view, diagnostics])

  return <div className="noter-code-editor" ref={hostRef} />
}

/** 指摘をその行の範囲に置く。空行では長さ 0 になり、lint が印だけを出す。 */
const toLintDiagnostics = (
  doc: TextLines,
  diagnostics: readonly EditorDiagnostic[],
): readonly LintDiagnostic[] =>
  diagnostics.map((diagnostic) => {
    const range = rangeAt(doc, diagnostic.line, diagnostic.column)
    return { from: range.from, to: range.to, severity: 'error', message: diagnostic.message }
  })
