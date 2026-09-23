/**
 * @qrcc/ui — qrcc の全 feature が使うデザインシステム。
 *
 * 基本コンポーネントとテーマは `@rimltools/ui` の共通実装を、qrcc のクラス名の接頭辞
 * （`qrcc-`）と保存キー（`qrcc-theme`）で作って export する。見た目（CSS）は qrcc が持つ。
 *
 * スタイルは 1 枚にまとめてあり、アプリは `@qrcc/ui/styles.css` を
 * link で 1 本張るだけでよい。
 *
 * 方針は .claude/skills/rimltools-html-a11y に従う:
 * 意味の合う HTML 要素を最優先し、ARIA は補強にだけ使う。
 */
import { createThemeKit, createUiComponents } from '@rimltools/ui'

export type { ButtonVariant, ThemePreference, ThemeStore } from '@rimltools/ui'

export const { Button, Field, LiveRegion, SkipLink, VisuallyHidden, ThemeToggle } =
  createUiComponents('qrcc')

export const { THEME_STORAGE_KEY, makeThemeStore, themeInitScript } = createThemeKit('qrcc-theme')

export { Window, WindowBar } from './components/window.tsx'
export type { WindowTone } from './components/window.tsx'
