/**
 * 「変換して新規作成」で作った文書に、最初の本文を渡す。
 *
 * 文書の作成（`documents.create`）は初期本文を受け取らない。作成してから
 * `/d/:id` を開いて `Y.Text` に入れる必要があるので、遷移をまたいで本文を
 * 預ける場所として `sessionStorage` を使う（そのタブの中だけで完結し、
 * サーバにも他のタブにも漏れない）。
 *
 * `sessionStorage` は private モードや設定で落ちる。落ちても
 * 「本文が空の新しい文書ができた」だけで、画面は動き続ける。
 */
const keyOf = (documentId: string): string => `noter-initial-body:${documentId}`

export const stashInitialBody = (documentId: string, text: string): void => {
  try {
    globalThis.sessionStorage.setItem(keyOf(documentId), text)
  } catch {
    // 預けられないだけ。新しい文書は空のまま開く
  }
}

/** 取り出したら必ず消す（次に開いたときにもう一度入らないように）。 */
export const takeInitialBody = (documentId: string): string | undefined => {
  try {
    const key = keyOf(documentId)
    const text = globalThis.sessionStorage.getItem(key)
    if (text === null) return undefined
    globalThis.sessionStorage.removeItem(key)
    return text
  } catch {
    return undefined
  }
}
