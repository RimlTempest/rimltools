/**
 * ラベルの下に出す文字を決める。
 *
 * 「出さない」も `Caption` のメンバーなので、ここでの分岐は網羅的になる
 * （メンバーを足すと `switch` が落ちる）。
 */
import type { Caption, PrintItem } from '../contract/index.ts'

/** 出す文字。出さないときは `undefined`。 */
export const captionFor = (item: PrintItem, caption: Caption): string | undefined => {
  switch (caption.kind) {
    case 'none':
      return undefined
    case 'name':
      // 名前が無い行で空のキャプションを出しても情報が増えないので、内容で代用する
      return item.name === '' ? item.content : item.name
    case 'content':
      return item.content
    case 'custom':
      return caption.text.trim() === '' ? undefined : caption.text
  }
}
