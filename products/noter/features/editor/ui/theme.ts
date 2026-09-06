/**
 * CodeMirror の見た目（`DESIGN.md` §4.3）。
 *
 * **生の色を書かない。** すべてトークン（`var(--noter-*)`）を参照するので、
 * ライト / ダークの切替とハイコントラストが 1 か所で効く。
 *
 * 構文ハイライトは 6 色以内。色相だけに意味を持たせないよう、
 * キーワードと見出しは太字も併用する。
 */
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { tags } from '@lezer/highlight'

const editorTheme = EditorView.theme({
  '&': {
    backgroundColor: 'var(--noter-surface-editor)',
    color: 'var(--noter-text)',
    fontSize: 'var(--noter-text-code)',
    fontFamily: 'var(--noter-font-mono)',
    height: '100%',
  },
  '.cm-content': {
    lineHeight: 'var(--noter-line-code)',
    caretColor: 'var(--noter-text)',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--noter-surface-sunken)',
    color: 'var(--noter-text-muted)',
    borderRight: '1px solid var(--noter-border)',
  },
  '.cm-activeLine': { backgroundColor: 'var(--noter-surface-hover)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--noter-surface-hover)' },
  '&.cm-focused': {
    outline: 'var(--noter-focus-width) solid var(--noter-focus-ring)',
    outlineOffset: '-3px',
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--noter-editor-selection)',
  },
  '.cm-lintRange-error': { textDecoration: 'underline wavy var(--noter-danger)' },
})

const highlightStyle = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.modifier, tags.operatorKeyword, tags.controlKeyword],
    color: 'var(--noter-syntax-keyword)',
    fontWeight: '600',
  },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--noter-syntax-string)' },
  {
    tag: [tags.number, tags.bool, tags.null, tags.atom],
    color: 'var(--noter-syntax-number)',
  },
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment, tags.meta],
    color: 'var(--noter-text-muted)',
    fontStyle: 'italic',
  },
  {
    tag: [tags.heading, tags.strong, tags.propertyName, tags.definition(tags.propertyName)],
    color: 'var(--noter-accent)',
    fontWeight: '600',
  },
  { tag: tags.invalid, color: 'var(--noter-danger)' },
])

export const noterTheme: Extension = [editorTheme, syntaxHighlighting(highlightStyle)]
