/**
 * yaml / toml / json を 1 つの形に正規化した値。
 *
 * 3 種別の相互変換とツリープレビューは、この型だけを見れば書ける。
 * 「JSON で表せるもの」に限定してあるので、`JSON.stringify` が必ず通る。
 */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

export type JsonObject = { readonly [key: string]: JsonValue }
