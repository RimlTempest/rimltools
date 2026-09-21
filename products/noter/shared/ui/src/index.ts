/**
 * @noter/ui — 全 feature が使うデザインシステム。
 *
 * スタイルは 1 枚にまとめてあり、アプリは `@noter/ui/styles.css` を
 * link で 1 本張るだけでよい。
 *
 * 方針は .claude/skills/rimltools-html-a11y に従う:
 * 意味の合う HTML 要素を最優先し、ARIA は補強にだけ使う。
 */
export { Avatar } from './components/avatar.tsx'
export { Button } from './components/button.tsx'
export type { ButtonVariant } from './components/button.tsx'
export { Field } from './components/field.tsx'
export { LiveRegion } from './components/live-region.tsx'
export { SkipLink } from './components/skip-link.tsx'
export { VisuallyHidden } from './components/visually-hidden.tsx'
export { THEME_STORAGE_KEY, makeThemeStore, themeInitScript } from './theme/theme.ts'
export type { ThemePreference, ThemeStore } from './theme/theme.ts'
export { ThemeToggle } from './theme/theme-toggle.tsx'
