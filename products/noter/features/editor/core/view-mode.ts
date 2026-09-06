/**
 * 表示モードの決め方（docs/design/ux.md §4.2 §7）。
 *
 * 幅の判定を関数にしてあるのは、`window` を直接見ないため。
 * 呼び出し側（`*.route.tsx`）が測った値を渡す。
 */
import type { ViewMode } from '../contract/view-mode.ts'
import { VIEW_MODES } from '../contract/view-mode.ts'

/** `DESIGN.md` §5 の 48rem。これ未満は縦積みになるので既定を「エディタのみ」にする。 */
export const SPLIT_MIN_WIDTH_PX = 768

export const defaultViewMode = (widthPx: number): ViewMode =>
  widthPx >= SPLIT_MIN_WIDTH_PX ? 'split' : 'editor'

/** `Cmd/Ctrl + \` の巡回。エディタ → 分割 → プレビュー → エディタ。 */
export const nextViewMode = (mode: ViewMode): ViewMode => {
  const index = VIEW_MODES.indexOf(mode)
  return VIEW_MODES[(index + 1) % VIEW_MODES.length] ?? 'editor'
}

/** `localStorage` から読み戻す。読めない値は `undefined`（既定に任せる）。 */
export const parseViewMode = (value: unknown): ViewMode | undefined =>
  VIEW_MODES.find((candidate) => candidate === value)
