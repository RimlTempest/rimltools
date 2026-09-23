import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

/*
 * エディタの文字色は、エディタの地とカーソル行の両方に対して 7:1（AAA 1.4.6）。
 *
 * axe は画面に出た文字しか検査しないので、「ダークのカーソル行の上に壊れた記述がある」
 * ような組み合わせは e2e では見つからない。色の定義（editor.css と riml-ds の themes/noter）
 * から計算して確かめる。
 */

type Oklch = { readonly l: number; readonly c: number; readonly h: number }
type Pair = { readonly light: Oklch; readonly dark: Oklch }

const read = (path: string | URL): string => readFileSync(path, 'utf8')
const editorCss = read(new URL('./editor.css', import.meta.url))
const rdTokensCss = read(Bun.resolveSync('@rimltempest/riml-ds-tokens/tokens.css', import.meta.dir))
const rdThemeCss = read(
  Bun.resolveSync('@rimltempest/riml-ds-tokens/themes/noter.css', import.meta.dir),
)

/** `oklch(42% 0.1 175)` と `oklch(0.42 0.1 175)` の両方を読む */
const parseOklch = (text: string): Oklch | undefined => {
  const m = /oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*\)/.exec(text)
  if (m === null) return undefined
  const l = Number(m[1]) / (m[2] === '%' ? 100 : 1)
  return { l, c: Number(m[3]), h: Number(m[4]) }
}

const palette = (): ReadonlyMap<string, Oklch> => {
  const map = new Map<string, Oklch>()
  // テーマは tokens.css の既定を上書きする
  for (const css of [rdTokensCss, rdThemeCss]) {
    for (const m of css.matchAll(/--rd-color-palette-([a-z]+-\d+):\s*(oklch\([^)]*\))/g)) {
      const color = parseOklch(m[2] ?? '')
      if (color !== undefined) map.set(m[1] ?? '', color)
    }
  }
  return map
}

/** riml-ds の意味の色（light-dark(var(palette-a), var(palette-b))）を noter テーマで解く */
const rdColor = (name: string): Pair => {
  const m = new RegExp(
    `--rd-color-${name}:\\s*light-dark\\(var\\(--rd-color-palette-([a-z]+-\\d+)\\),\\s*var\\(--rd-color-palette-([a-z]+-\\d+)\\)\\)`,
  ).exec(rdTokensCss)
  const p = palette()
  const light = p.get(m?.[1] ?? '')
  const dark = p.get(m?.[2] ?? '')
  if (light === undefined || dark === undefined) throw new Error(`unknown --rd-color-${name}`)
  return { light, dark }
}

/** editor.css の `--noter-x: light-dark(oklch(…), oklch(…))` */
const editorColor = (name: string): Pair => {
  const m = new RegExp(
    `--noter-${name}:\\s*light-dark\\((oklch\\([^)]*\\)),\\s*(oklch\\([^)]*\\))\\)`,
  ).exec(editorCss)
  const light = parseOklch(m?.[1] ?? '')
  const dark = parseOklch(m?.[2] ?? '')
  if (light === undefined || dark === undefined) throw new Error(`unknown --noter-${name}`)
  return { light, dark }
}

const mix = (a: Oklch, b: Oklch): Oklch => ({
  l: (a.l + b.l) / 2,
  c: (a.c + b.c) / 2,
  h: (a.h + b.h) / 2,
})

const clamp = (x: number) => Math.min(1, Math.max(0, x))

/** oklch → sRGB の相対輝度（WCAG 2 のコントラスト比の入力） */
const luminance = ({ l, c, h }: Oklch): number => {
  const a = c * Math.cos((h * Math.PI) / 180)
  const b = c * Math.sin((h * Math.PI) / 180)
  const l3 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m3 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s3 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  const r = clamp(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3)
  const g = clamp(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3)
  const bl = clamp(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3)
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl
}

const contrast = (x: Oklch, y: Oklch): number => {
  const [hi, lo] = [luminance(x), luminance(y)].toSorted((p, q) => q - p)
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05)
}

const surface = rdColor('surface-default')
const sunken = rdColor('surface-sunken')
// tokens.css の --noter-surface-editor（ライトは地のまま、ダークは地と sunken の中間）
const editorSurface: Pair = { light: surface.light, dark: mix(surface.dark, sunken.dark) }

const foregrounds: Readonly<Record<string, Pair>> = {
  'syntax-keyword': editorColor('syntax-keyword'),
  'syntax-string': editorColor('syntax-string'),
  'syntax-number': editorColor('syntax-number'),
  // 見出し・キーは accent、コメントは muted、壊れた記述は danger を流用する（editor.css）
  accent: rdColor('accent-text'),
  muted: rdColor('text-muted'),
  danger: rdColor('status-danger-text'),
  text: rdColor('text-default'),
}

const backgrounds: Readonly<Record<string, Pair>> = {
  'surface-editor': editorSurface,
  'editor-active-line': editorColor('editor-active-line'),
}

describe('エディタの文字色は地とカーソル行に対して 7:1（AAA 1.4.6）', () => {
  for (const mode of ['light', 'dark'] as const) {
    for (const [bgName, bg] of Object.entries(backgrounds)) {
      test(`${mode}: ${bgName}`, () => {
        const failing = Object.entries(foregrounds)
          .map(
            ([fgName, fg]) =>
              [fgName, Math.round(contrast(fg[mode], bg[mode]) * 100) / 100] as const,
          )
          .filter(([, ratio]) => ratio < 7)
        expect(failing).toEqual([])
      })
    }
  }
})
