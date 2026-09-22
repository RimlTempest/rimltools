/**
 * 文書種別 → CodeMirror の言語（`.claude/skills/noter-architecture` §3 の拡張レシピ）。
 *
 * Mapped Type なので、`DocumentKind` を足すとここの書き忘れがコンパイルエラーになる。
 * `core` ではなく `ui` に置くのは、CodeMirror に依存するため。
 */
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { yaml } from '@codemirror/lang-yaml'
import { StreamLanguage } from '@codemirror/language'
import { toml } from '@codemirror/legacy-modes/mode/toml'
import type { Extension } from '@codemirror/state'
import type { DocumentKind } from '@noter/contract'

const LANGUAGE: { readonly [K in DocumentKind]: () => Extension } = {
  markdown: () => markdown(),
  yaml: () => yaml(),
  json: () => json(),
  // TOML は専用パッケージが無いので legacy modes のストリームパーサを使う
  toml: () => StreamLanguage.define(toml),
}

export const languageOf = (kind: DocumentKind): Extension => LANGUAGE[kind]()
