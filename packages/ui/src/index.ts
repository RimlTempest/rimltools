/**
 * @rimltools/ui — 全プロダクト共通のアクセシブルな基本コンポーネント。
 *
 * 見た目（CSS）とクラス名の接頭辞はプロダクトが持つ。プロダクトの `@<tool>/ui` が
 * `createUiComponents('<tool>')` / `createThemeKit('<tool>-theme')` を呼び、
 * できたコンポーネントを自分の名前で export する。描画される DOM は共通化の前と変わらない。
 *
 * 方針は .claude/skills/rimltools-html-a11y に従う:
 * 意味の合う HTML 要素を最優先し、ARIA は補強にだけ使う。
 */
import { makeButton } from './components/button.tsx'
import { makeField } from './components/field.tsx'
import { makeLiveRegion } from './components/live-region.tsx'
import { makeSkipLink } from './components/skip-link.tsx'
import { makeVisuallyHidden } from './components/visually-hidden.tsx'
import { makeThemeToggle } from './theme/theme-toggle.tsx'

export type { ButtonVariant } from './components/button.tsx'
export type { ThemePreference, ThemeStore } from './theme/theme.ts'
export { createThemeKit } from './theme/theme.ts'

/** クラス名の接頭辞（例: `qrcc` → `qrcc-button`）を決めて、基本コンポーネント一式を作る。 */
export const createUiComponents = (prefix: string) => ({
  Button: makeButton(prefix),
  Field: makeField(prefix),
  LiveRegion: makeLiveRegion(prefix),
  SkipLink: makeSkipLink(prefix),
  VisuallyHidden: makeVisuallyHidden(prefix),
  ThemeToggle: makeThemeToggle(prefix),
})
