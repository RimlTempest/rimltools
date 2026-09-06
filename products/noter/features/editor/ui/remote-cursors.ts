/**
 * 他人のカーソルを支援技術から隠す（`docs/accessibility.md` §3）。
 *
 * y-codemirror.next はキャレットと名前ラベルをウィジェットとして描く。
 * そのまま置くと、行を読み上げる途中に他人の名前が割り込む。位置の変化を
 * 逐次読み上げても使えるものにはならないので、`aria-hidden` にして
 * 「誰がいるか」は参加者一覧に任せる。
 *
 * ウィジェットの中の属性変更は CodeMirror の DOM オブザーバが無視する
 * （`readMutation` はウィジェットの子孫を見ない）ので、入力とは競合しない。
 */
import { ViewPlugin } from '@codemirror/view'
import type { EditorView } from '@codemirror/view'

const hideCarets = (view: EditorView): void => {
  for (const caret of view.dom.querySelectorAll('.cm-ySelectionCaret')) {
    if (caret.getAttribute('aria-hidden') !== 'true') caret.setAttribute('aria-hidden', 'true')
  }
}

export const hiddenRemoteCursors = ViewPlugin.define((view: EditorView) => {
  hideCarets(view)
  return { update: () => hideCarets(view) }
})
