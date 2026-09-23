import { useEffect, useRef, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import type { DocumentKind } from '@noter/contract'
import type { Awareness } from 'y-protocols/awareness'
import type * as Y from 'yjs'
import type { EditorDiagnostic } from '../contract/diagnostic.ts'
import type * as EditorViewModule from './code-editor-view.ts'

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

type EditorModule = typeof EditorViewModule

/**
 * CodeMirror 一式（`code-editor-view.ts`）をブラウザでだけ読む。
 *
 * エディタは effect の中でしか作らないので、サーバの描画には要らない。
 * `import.meta.env.SSR` はビルド時の定数なので、Worker のバンドルからは import ごと消える
 * （docs/bundle.md）。ブラウザではこのモジュールの評価と同時に取りに行くので、
 * ハイドレーションと並行して読み込まれる。
 */
const editorModule: Promise<EditorModule> | null = import.meta.env.SSR
  ? null
  : import('./code-editor-view.ts')

type Editor = { readonly view: EditorView; readonly module: EditorModule }

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
 *   ずれるので、文書の中に収まるよう必ず丸める（`code-editor-view.ts`）
 * - CodeMirror はブラウザでだけ読む（上の `editorModule`）
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
  const [editor, setEditor] = useState<Editor | undefined>(undefined)
  // 再生成の引き金にしたくない値は ref 経由で読む。書き込みは描画の外で行う
  const noticeRef = useRef(onNotice)
  const readyRef = useRef(onReady)

  useEffect(() => {
    noticeRef.current = onNotice
    readyRef.current = onReady
  }, [onNotice, onReady])

  useEffect(() => {
    const parent = hostRef.current
    if (parent === null || editorModule === null) return
    let created: EditorView | undefined
    let disposed = false

    const mount = async (): Promise<void> => {
      const module = await editorModule
      if (disposed) return
      const view = module.createEditorView({
        parent,
        ytext,
        awareness,
        undoManager,
        kind,
        readOnly,
        onNotice: (message) => noticeRef.current(message),
      })
      created = view

      readyRef.current?.({
        replaceAll: (text) => {
          view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
        },
        insertAtCursor: (text) => {
          view.dispatch(view.state.replaceSelection(text))
        },
        goTo: (line, column) => {
          view.dispatch({
            selection: { anchor: module.cursorAt(view, line, column) },
            scrollIntoView: true,
          })
          view.focus()
        },
        focus: () => view.focus(),
      })

      // 「開いた瞬間に書ける」（ux.md §2 原則 1）。閲覧のみのときは奪わない
      if (!readOnly) view.focus()
      setEditor({ view, module })
    }
    void mount()

    return () => {
      disposed = true
      if (created === undefined) return
      readyRef.current?.(undefined)
      setEditor(undefined)
      created.destroy()
    }
  }, [ytext, awareness, undoManager, kind, readOnly])

  useEffect(() => {
    if (editor === undefined) return
    editor.module.showDiagnostics(editor.view, diagnostics ?? [])
  }, [editor, diagnostics])

  return <div className="noter-code-editor" ref={hostRef} />
}
