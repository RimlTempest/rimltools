/**
 * 整形を試みた結果。
 *
 * **本文の差し替えは画面（`EditorScreen`）が行う。** 配線側は「整形すると
 * どうなるか」だけを返し、CodeMirror にも読み上げにも触らない。
 */
export type FormatOutcome =
  /** 整形できた。`text` で本文を丸ごと置き換える。 */
  | { readonly kind: 'formatted'; readonly text: string }
  /** すでに整形されていて、変えるところが無かった。 */
  | { readonly kind: 'unchanged' }
  /** 解析できなかった。指摘は `diagnostics` に出ている。 */
  | { readonly kind: 'failed' }
