import { VisuallyHidden } from '@noter/ui'
import type { ViewMode } from '../contract/view-mode.ts'
import { VIEW_MODES, VIEW_MODE_LABEL } from '../contract/view-mode.ts'

type ViewSwitchProps = {
  readonly mode: ViewMode
  readonly onChange: (mode: ViewMode) => void
}

/**
 * エディタ / 分割 / プレビューの切替（docs/design/ux.md §4.2）。
 *
 * 分割の比率はドラッグではなくこの 3 ボタンで変える（AAA 2.5.7 ドラッグ操作）。
 * いま選ばれているものは `aria-pressed` で伝えるので、押した状態を色だけに
 * 頼らない。
 */
export const ViewSwitch = ({ mode, onChange }: ViewSwitchProps) => (
  <fieldset className="noter-view-switch">
    <VisuallyHidden as="legend">表示</VisuallyHidden>
    {VIEW_MODES.map((candidate) => (
      <button
        key={candidate}
        type="button"
        className="noter-view-switch__button"
        aria-pressed={mode === candidate}
        onClick={() => onChange(candidate)}
      >
        {VIEW_MODE_LABEL[candidate]}
      </button>
    ))}
  </fieldset>
)
