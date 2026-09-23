/**
 * 構造化データの文書を整形して書き直す。
 *
 * 「解析して、正規化した値から書き直す」ので、空白やインデントの揺れは
 * すべて消える。逆に**コメントは失われる**（yaml / toml のコメントは
 * JsonValue に載らない）。この割り切りは docs/design/ux.md §4.2 のとおり。
 */
import type { DocumentKind, Result } from '@noter/contract'
import { err, ok } from '@noter/contract'
import { stringify as stringifyToml } from 'smol-toml'
import { stringify as stringifyYaml } from 'yaml'
import type { DataDocumentKind } from '../contract/data-kind.ts'
import type { Diagnostic } from '../contract/diagnostic.ts'
import type { JsonValue } from '../contract/json-value.ts'
import { parseDocument } from './parse.ts'

export type FormatError =
  /** markdown には「正しい形」が 1 つに決まらないので整形しない。 */
  | { readonly reason: 'unsupported' }
  /** 解析に失敗した。問題パネルにそのまま出せる指摘を持つ。 */
  | { readonly reason: 'invalid'; readonly diagnostics: readonly Diagnostic[] }

export const formatDocument = (kind: DocumentKind, text: string): Result<string, FormatError> => {
  if (kind === 'markdown') return err({ reason: 'unsupported' })
  const parsed = parseDocument(kind, text)
  if (!parsed.ok) return err({ reason: 'invalid', diagnostics: parsed.error })
  if (parsed.value.kind !== 'data') return err({ reason: 'unsupported' })
  const written = stringifyData(kind, parsed.value.value)
  return written.ok ? written : err({ reason: 'invalid', diagnostics: written.error })
}

/**
 * 正規化済みの値を種別ごとのテキストに書き戻す。
 *
 * 変換（`convert.ts`）とも共有する。smol-toml は書けない値で throw するので
 * ここで受け止め、指摘に変える。
 */
export const stringifyData = (
  kind: DataDocumentKind,
  value: JsonValue,
): Result<string, readonly Diagnostic[]> => {
  switch (kind) {
    case 'json':
      // JSON.stringify は JsonValue なら必ず成功する。末尾改行は自分で足す。
      return ok(`${JSON.stringify(value, null, 2)}\n`)
    case 'yaml':
      return write('yaml', () => stringifyYaml(value, { indent: 2 }))
    case 'toml':
      return write('toml', () => stringifyToml(value))
  }
}

const write = (
  source: DataDocumentKind,
  run: () => string,
): Result<string, readonly Diagnostic[]> => {
  try {
    return ok(run())
  } catch (error) {
    return err([
      {
        severity: 'error',
        line: 1,
        column: 1,
        message: error instanceof Error ? error.message : 'この内容は書き出せませんでした。',
        hint: 'この形式で表せない値が含まれています。別の形式で書き出してください。',
        source,
      },
    ])
  }
}
