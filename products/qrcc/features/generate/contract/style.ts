/**
 * 見た目の設定。symbology とは独立して持つ。
 *
 * Rust 側の定義は `features/generate/engine/src/style.rs`。
 */
import type { HexColor } from '@qrcc/contract'

export type Paint =
  | { readonly kind: 'solid'; readonly color: HexColor }
  | { readonly kind: 'transparent' }

export type ModuleShape = 'square' | 'dot' | 'rounded'

export type RenderStyle = {
  readonly foreground: HexColor
  readonly background: Paint
  /** 1 モジュールあたりの px。 */
  readonly scale: number
  /** 静寂域（モジュール数）。null なら symbology の推奨値。 */
  readonly quiet_zone: number | null
  readonly module_shape: ModuleShape
  /** 1D のバー高さ（モジュール数）。 */
  readonly bar_height: number
  /** 1D の下に数字を出すか。 */
  readonly human_readable: boolean
}

export const MODULE_SHAPE_META: {
  readonly [K in ModuleShape]: { readonly label: string }
} = {
  square: { label: '四角（標準）' },
  dot: { label: '丸' },
  rounded: { label: '角丸' },
}

/** 読み取り機がまず失敗しないコントラスト比の下限。 */
export const MIN_READABLE_CONTRAST = 3
