import { useEffect, useRef } from 'react'
import { defaultKeymap } from '@codemirror/commands'
import { bracketMatching, indentOnInput } from '@codemirror/language'
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
import { describeImportError } from '../contract/import-error.ts'
import { byteLength, checkImportSize } from '../core/import-guard.ts'
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
 */
export const CodeEditor = ({
  ytext,
  awareness,
  undoManager,
  kind,
  readOnly,
  onNotice,
  onReady,
}: CodeEditorProps) => {
  const hostRef = useRef<HTMLDivElement>(null)
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
      paste: (event, view) => {
        const pasted = event.clipboardData?.getData('text/plain') ?? ''
        if (pasted === '') return false
        const size = checkImportSize(byteLength(view.state.doc.toString()) + byteLength(pasted))
        if (size.ok) return false
        event.preventDefault()
        noticeRef.current(describeImportError(size.error))
        return true
      },
    })

    const view = new EditorView({
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

    const at = (line: number, column: number): number => {
      const target = view.state.doc.line(Math.min(Math.max(line, 1), view.state.doc.lines))
      return Math.min(target.from + Math.max(column - 1, 0), target.to)
    }

    readyRef.current?.({
      replaceAll: (text) => {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
      },
      insertAtCursor: (text) => {
        view.dispatch(view.state.replaceSelection(text))
      },
      goTo: (line, column) => {
        const position = at(line, column)
        view.dispatch({ selection: { anchor: position }, scrollIntoView: true })
        view.focus()
      },
      focus: () => view.focus(),
    })

    // 「開いた瞬間に書ける」（ux.md §2 原則 1）。閲覧のみのときは奪わない
    if (!readOnly) view.focus()

    return () => {
      readyRef.current?.(undefined)
      view.destroy()
    }
  }, [ytext, awareness, undoManager, kind, readOnly])

  return <div className="noter-code-editor" ref={hostRef} />
}
