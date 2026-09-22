/**
 * bun test 用の DOM 環境。`bunfig.toml` の `[test] preload` から読み込まれる。
 *
 * import より先に登録する必要があるため、テストファイル内では登録できない
 * （ESM の import は本体より先に評価される）。
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator'

if (globalThis.document === undefined) {
  GlobalRegistrator.register({ url: 'https://noter.riml4i.com/' })
}

/**
 * happy-dom の `Node.prototype.nodeName` を仕様どおりに直す当て木。
 * **本番のコードから import しない。**
 *
 * DOM の仕様では `Node.prototype.nodeName` のゲッタが全ノード種別の名前を
 * 返す。happy-dom はこれを `Element.prototype` 側にだけ実装しており、
 * `Node.prototype` のゲッタは空文字列を返す。
 *
 * DOMPurify は「clobbering（`<input name="nodeName">` などでプロパティを
 * 乗っ取る攻撃）」を避けるため、要素のタグ名を **`Node.prototype` から取り出した
 * ゲッタ**で読む。素の happy-dom ではその結果が常に空文字列になり、
 * すべての要素が「許可されていないタグ」と判定されて中身だけが残る
 * （＝サニタイズが機能しない）。ブラウザでは起きない。
 *
 * ここでは `Node.prototype` のゲッタだけを仕様どおりに直す。要素は
 * `Element.prototype` のゲッタが引き続き優先されるので、happy-dom 自身の
 * 挙動は変えない。
 *
 * **DOMPurify は import された時点でゲッタを取り込む**ので、この当て木は
 * DOMPurify を読み込むどの import よりも先に評価されなければならない。
 * preload はテストファイルの import より前に走るので、それが保証される。
 */

/** 要素以外のノード種別の nodeName（DOM 仕様）。 */
const NODE_NAMES: Readonly<Record<number, string>> = {
  3: '#text',
  4: '#cdata-section',
  8: '#comment',
  9: '#document',
  11: '#document-fragment',
}

Object.defineProperty(Node.prototype, 'nodeName', {
  configurable: true,
  enumerable: false,
  get(this: Node): string {
    // 要素の nodeName は tagName と同じ（HTML は大文字、SVG は原文のまま）。
    if (this instanceof Element) return this.tagName
    return NODE_NAMES[this.nodeType] ?? ''
  },
})
