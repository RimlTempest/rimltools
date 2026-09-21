/**
 * エディタとプレビューの見せ方（docs/design/ux.md §4.2）。
 *
 * ドラッグでの比率変更に頼らず、この 3 つのボタンで切り替える（AAA 2.5.7）。
 */
export const VIEW_MODES = ['editor', 'split', 'preview'] as const

export type ViewMode = (typeof VIEW_MODES)[number]

/** 表示切替ボタンの文言。`ViewMode` を足すと書き忘れがコンパイルエラーになる。 */
export const VIEW_MODE_LABEL: { readonly [M in ViewMode]: string } = {
  editor: 'エディタのみ',
  split: '分割',
  preview: 'プレビューのみ',
}
