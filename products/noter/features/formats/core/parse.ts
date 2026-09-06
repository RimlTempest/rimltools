/**
 * 本文を種別ごとに解析し、値か「指摘の一覧」を返す。
 *
 * yaml / smol-toml / jsonc-parser は失敗を throw か配列で返すが、この層から
 * 外へは必ず `Result` で出す。**ライブラリの throw を try/catch で受けて
 * Result に変換するのはこの関数の役目**であり、ドメイン層の throw 禁止
 * （`noter/no-throw-in-domain`）に反しない。
 *
 * 位置は 1 始まりの行・列に揃える（エディタの行番号表示と一致させる）。
 */
import type { DocumentKind, Result } from '@noter/contract'
import { err, ok } from '@noter/contract'
import type { ParseError } from 'jsonc-parser'
import { getNodeValue, parseTree, printParseErrorCode } from 'jsonc-parser'
import { TomlError, parse as parseTomlText } from 'smol-toml'
import type { YAMLError } from 'yaml'
import { parseDocument as parseYamlDocument } from 'yaml'
import type { DataDocumentKind } from '../contract/data-kind.ts'
import type { Diagnostic, DiagnosticSource } from '../contract/diagnostic.ts'
import type { JsonValue } from '../contract/json-value.ts'
import { toJsonValue } from './normalize.ts'
import { positionAt } from './position.ts'

export type ParsedDocument =
  | { readonly kind: 'markdown' }
  | { readonly kind: 'data'; readonly value: JsonValue }

export type ParseDiagnostics = readonly Diagnostic[]

export const parseDocument = (
  kind: DocumentKind,
  text: string,
): Result<ParsedDocument, ParseDiagnostics> => {
  switch (kind) {
    case 'markdown':
      // markdown に構文エラーは無い（どんな文字列でも段落として読める）。
      return ok({ kind: 'markdown' })
    case 'yaml':
      return parseYaml(text)
    case 'toml':
      return parseToml(text)
    case 'json':
      return parseJson(text)
  }
}

// --- 正規化 ------------------------------------------------------------------

const intoData = (
  source: DataDocumentKind,
  value: unknown,
): Result<ParsedDocument, ParseDiagnostics> => {
  const normalized = toJsonValue(value)
  if (normalized.ok) return ok({ kind: 'data', value: normalized.value })
  return err([
    diagnostic({
      source,
      line: 1,
      column: 1,
      message: `${normalized.error.path} の値（${normalized.error.typeName}）は扱えません。`,
      hint: 'この値は他の形式に変換できません。文字列か数値に書き換えてください。',
    }),
  ])
}

const diagnostic = (input: {
  readonly source: DiagnosticSource
  readonly line: number
  readonly column: number
  readonly message: string
  readonly hint: string
}): Diagnostic => ({
  severity: 'error',
  line: input.line,
  column: input.column,
  message: input.message,
  hint: input.hint,
  source: input.source,
})

// --- yaml --------------------------------------------------------------------

/** `prettyErrors` が付ける「 at line 3, column 1:」以降の装飾。 */
const YAML_PRETTY_SUFFIX = / at line \d+, column \d+:[\s\S]*$/

const YAML_HINTS: Readonly<Record<string, string>> = {
  BAD_INDENT: 'インデントの深さを親の項目に揃えてください（タブではなく半角スペース）。',
  TAB_AS_INDENT: 'インデントにタブは使えません。半角スペースに置き換えてください。',
  DUPLICATE_KEY: '同じ階層に同じキーは 1 つだけです。片方を消すか名前を変えてください。',
  MISSING_CHAR: '閉じ括弧か引用符が足りていないか確認してください。',
  UNEXPECTED_TOKEN: 'キーと値は `キー: 値` の形で書きます。区切りの `:` と空白を確認してください。',
  BLOCK_AS_IMPLICIT_KEY: 'キーの後に改行を入れず、`キー: 値` を 1 行で書いてください。',
  MULTILINE_IMPLICIT_KEY:
    'キーは 1 行で書きます。値を次の行に置くならインデントを深くしてください。',
}

const DEFAULT_YAML_HINT =
  'この行の書き方を見直してください。インデントと `:` の位置がよくある原因です。'

const parseYaml = (text: string): Result<ParsedDocument, ParseDiagnostics> => {
  const document = parseYamlDocument(text, { prettyErrors: true, uniqueKeys: true })
  if (document.errors.length > 0) {
    return err(document.errors.map((error) => toYamlDiagnostic(error, text)))
  }
  return intoData('yaml', document.toJS())
}

const toYamlDiagnostic = (error: YAMLError, text: string): Diagnostic => {
  const linePos = error.linePos?.[0]
  const position = linePos ?? asLinePos(positionAt(text, error.pos[0]))
  return diagnostic({
    source: 'yaml',
    line: position.line,
    column: position.col,
    message: error.message.replace(YAML_PRETTY_SUFFIX, ''),
    hint: YAML_HINTS[error.code] ?? DEFAULT_YAML_HINT,
  })
}

const asLinePos = (position: { readonly line: number; readonly column: number }) => ({
  line: position.line,
  col: position.column,
})

// --- toml --------------------------------------------------------------------

const TOML_HINT =
  '`キー = 値` の形か、`[テーブル名]` の見出しかを確認してください。文字列は `"` で囲みます。'

const parseToml = (text: string): Result<ParsedDocument, ParseDiagnostics> => {
  try {
    return intoData('toml', parseTomlText(text))
  } catch (error) {
    return err([toTomlDiagnostic(error)])
  }
}

const toTomlDiagnostic = (error: unknown): Diagnostic => {
  if (error instanceof TomlError) {
    // TomlError は line / column を 1 始まりで持つ。message には位置を図示する
    // コードブロックが続くので、1 行目だけを使う。
    return diagnostic({
      source: 'toml',
      line: error.line,
      column: error.column,
      message: firstLine(error.message),
      hint: TOML_HINT,
    })
  }
  return diagnostic({
    source: 'toml',
    line: 1,
    column: 1,
    message:
      error instanceof Error ? firstLine(error.message) : 'TOML として読み取れませんでした。',
    hint: TOML_HINT,
  })
}

const firstLine = (message: string): string => (message.split('\n')[0] ?? message).trim()

// --- json --------------------------------------------------------------------

const JSON_PARSE_OPTIONS = {
  disallowComments: true,
  allowTrailingComma: false,
  allowEmptyContent: false,
} as const

type JsonMessage = { readonly message: string; readonly hint: string }

const JSON_MESSAGES: Readonly<Record<string, JsonMessage>> = {
  CloseBraceExpected: {
    message: '`}` が足りません。',
    hint: '開いた `{` の数だけ `}` を書いてください。',
  },
  CloseBracketExpected: {
    message: '`]` が足りません。',
    hint: '開いた `[` の数だけ `]` を書いてください。',
  },
  CommaExpected: {
    message: '`,` が足りません。',
    hint: '要素と要素の間には `,` を書きます。最後の要素の後ろには書きません。',
  },
  ColonExpected: { message: '`:` が足りません。', hint: 'キーと値は `"キー": 値` で区切ります。' },
  PropertyNameExpected: {
    message: 'キーの名前がありません。',
    hint: 'キーは `"名前"` のように二重引用符で囲みます。',
  },
  ValueExpected: { message: '値がありません。', hint: '`:` の後ろに値を書いてください。' },
  EndOfFileExpected: {
    message: '文書の終わりの後に余分な文字があります。',
    hint: 'JSON に書けるトップレベルの値は 1 つだけです。',
  },
  InvalidSymbol: {
    message: '解釈できない記号があります。',
    hint: '値は文字列・数値・true / false / null・配列・オブジェクトのどれかです。',
  },
  InvalidNumberFormat: {
    message: '数値の書き方が正しくありません。',
    hint: '先頭の `+` や `0` の重複、末尾の `.` は使えません。',
  },
  InvalidCommentToken: {
    message: 'JSON にコメントは書けません。',
    hint: 'コメントを残したいときは、メモ用のキーを 1 つ足してください。',
  },
  UnexpectedEndOfComment: {
    message: 'JSON にコメントは書けません。',
    hint: 'コメントを残したいときは、メモ用のキーを 1 つ足してください。',
  },
  UnexpectedEndOfString: {
    message: '文字列が閉じていません。',
    hint: '文字列は `"` で始めて `"` で閉じます。改行を挟むときは `\\n` と書きます。',
  },
  UnexpectedEndOfNumber: {
    message: '数値が途中で終わっています。',
    hint: '小数点の後ろに数字を書いてください。',
  },
  InvalidUnicode: {
    message: 'Unicode エスケープの書き方が正しくありません。',
    hint: '`\\u` の後ろには 16 進数を 4 桁書きます。',
  },
  InvalidEscapeCharacter: {
    message: 'エスケープの書き方が正しくありません。',
    hint: '`\\` の後ろに書けるのは `" \\ / b f n r t u` だけです。',
  },
  InvalidCharacter: {
    message: '文字列の中に使えない文字があります。',
    hint: '制御文字は `\\n` や `\\t` のようにエスケープしてください。',
  },
}

const DEFAULT_JSON_MESSAGE: JsonMessage = {
  message: 'JSON として読み取れませんでした。',
  hint: '括弧・引用符・カンマの対応を確認してください。',
}

const parseJson = (text: string): Result<ParsedDocument, ParseDiagnostics> => {
  const errors: ParseError[] = []
  const tree = parseTree(text, errors, JSON_PARSE_OPTIONS)
  if (errors.length > 0) {
    return err(dedupeByPosition(errors.map((error) => toJsonDiagnostic(error, text))))
  }
  if (tree === undefined) {
    return err([
      diagnostic({
        source: 'json',
        line: 1,
        column: 1,
        message: '内容が空です。',
        hint: 'JSON には値が 1 つ必要です。`{}` から書き始めてください。',
      }),
    ])
  }
  return intoData('json', getNodeValue(tree))
}

const toJsonDiagnostic = (error: ParseError, text: string): Diagnostic => {
  const position = positionAt(text, error.offset)
  const described = JSON_MESSAGES[printParseErrorCode(error.error)] ?? DEFAULT_JSON_MESSAGE
  return diagnostic({
    source: 'json',
    line: position.line,
    column: position.column,
    message: described.message,
    hint: described.hint,
  })
}

/**
 * jsonc-parser は 1 つの書き間違いに複数のコードを返すことがある
 * （`]` と `}` の両方が足りない、など）。同じ位置の指摘は先頭だけ残す。
 */
const dedupeByPosition = (diagnostics: readonly Diagnostic[]): readonly Diagnostic[] => {
  const seen = new Set<string>()
  const unique: Diagnostic[] = []
  for (const item of diagnostics) {
    const key = `${item.line}:${item.column}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(item)
  }
  return unique
}
