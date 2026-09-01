/**
 * `style` 属性で CSS カスタムプロパティを渡せるようにする。
 *
 * 台紙の寸法は core が持ち、CSS は `var()` で読む（ADR-0005）。その受け渡しに
 * `style={{ '--qrcc-cell-inline': '70mm' }}` を使うが、React の
 * `CSSProperties` は既知のプロパティしか受け付けない。`as` は禁止なので、
 * csstype が公式に案内している宣言マージで型を広げる。
 *
 * 宣言マージは `interface` でしか行えないため、ここだけ
 * `consistent-type-definitions` の例外にする（`type` では実現できない）。
 */
import type { CSSProperties } from 'react'

declare module 'csstype' {
  // oxlint-disable-next-line typescript/consistent-type-definitions
  interface Properties {
    [index: `--${string}`]: string | number | undefined
  }
}

/**
 * `style` 属性に渡す値。上の宣言マージが効いた `CSSProperties`。
 *
 * この型を使う側から import されることで、宣言マージが
 * そのプログラム（apps/web を含む）に確実に読み込まれる。
 */
export type StyleWithCustomProperties = CSSProperties
