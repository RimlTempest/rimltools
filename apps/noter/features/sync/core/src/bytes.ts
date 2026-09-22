/**
 * バイト列のちょっとした変換。
 *
 * `Uint8Array#buffer` の型は `ArrayBufferLike`（`SharedArrayBuffer` を含む）なので、
 * `ArrayBuffer` を要求する API にそのままは渡せない。`as` で黙らせず、
 * 見ている範囲だけを新しい `ArrayBuffer` に写す。
 */
export const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}
