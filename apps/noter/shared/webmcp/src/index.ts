/**
 * @noter/webmcp — WebMCP（`document.modelContext`）への登録層（docs/adr/0012-webmcp.md）。
 *
 * WebMCP は 2026-09 時点で Origin Trial 段階（Chrome 149 / Edge 150）で、
 * 既定ではどのブラウザでも有効になっていない。この層は「API があれば登録し、
 * 無ければ何もしない」形にすることで、**API が無い環境で挙動が一切変わらない**
 * ことを保証する。
 *
 * ここは `shared/` なので **features に依存しない**。文書の本文も指摘も
 * 一覧も、すべて `WebMcpDeps` として呼び出し側（各 feature のルートファイル）
 * から関数で受け取る。DOM を見るのは `modelContextOf` だけ。
 *
 * **編集は「提案」までにする（ADR-0012）。** `propose-edit` は
 * `deps.proposeEdit` を呼ぶだけで、`Y.Doc` にも DOM にも触れない。
 */
import type { DocumentKind } from '@noter/contract'
import { parseDocumentKind } from '@noter/contract'

/** ツールが返す中身。WebMCP の `content` 配列。 */
export type WebMcpToolResult = {
  readonly content: readonly { readonly type: 'text'; readonly text: string }[]
}

export type WebMcpTool = {
  readonly name: string
  readonly description: string
  readonly inputSchema: Readonly<Record<string, unknown>>
  readonly execute: (input: Readonly<Record<string, unknown>>) => Promise<WebMcpToolResult>
}

/**
 * ブラウザが提供する `document.modelContext` の、この層が使う部分だけ。
 * 実物に依存しないので、テストでは偽物を渡せる。
 *
 * **`exposedTo` はここに存在しない。** 渡す経路そのものを無くしている
 * （既定の同一オリジン + ブラウザ組み込みエージェントのみへの公開を保つため）。
 */
export type ModelContext = {
  readonly registerTool: (
    tool: WebMcpTool,
    options: { readonly signal: AbortSignal },
  ) => Promise<unknown>
}

/**
 * 問題パネルに出る 1 行と同じ形。**`@noter/formats` には依存しない**
 * （`shared/` から feature を見に行かないため）。行・列は 1 始まり。
 */
export type ToolDiagnostic = {
  readonly line: number
  readonly column: number
  readonly message: string
}

export type WebMcpDocumentSummary = {
  readonly id: string
  readonly title: string
  readonly kind: DocumentKind
}

/**
 * ツールの中身。**すべて呼び出し側が用意する。**
 * この層はブラウザの API と繋ぐだけで、文書のことを何も知らない。
 */
export type WebMcpDeps = {
  /** いま開いている文書。開いていなければ `null`。 */
  readonly readDocument: () => { readonly kind: DocumentKind; readonly text: string } | null
  readonly diagnose: () => readonly ToolDiagnostic[]
  readonly listDocuments: () => readonly WebMcpDocumentSummary[]
  /** 提案を出すだけ。適用するかどうかは人が決める（ADR-0012）。 */
  readonly proposeEdit: (text: string) => void
}

/** ツールが返す本文を組み立てるだけの補助。 */
const textResult = (text: string): WebMcpToolResult => ({ content: [{ type: 'text', text }] })

const NO_INPUT = { type: 'object', properties: {}, additionalProperties: false } as const

const PROPOSE_INPUT = {
  type: 'object',
  properties: {
    text: { type: 'string', description: '文書の新しい本文（全文）' },
  },
  required: ['text'],
  additionalProperties: false,
} as const

/**
 * `document.modelContext` を取り出す。
 *
 * 標準の型定義にまだ無いグローバルなので `Reflect.get` で取り出し、形は
 * `typeof` だけで確かめる（`as` は使わない）。SSR とハイドレーション前は
 * `document` が無いので、必ず `undefined` を返す。
 */
const modelContextOf = (doc: unknown): ModelContext | undefined => {
  if (typeof doc !== 'object' || doc === null) return undefined

  const modelContext: unknown = Reflect.get(doc, 'modelContext')
  if (typeof modelContext !== 'object' || modelContext === null) return undefined

  const registerTool: unknown = Reflect.get(modelContext, 'registerTool')
  if (typeof registerTool !== 'function') return undefined

  return { registerTool: registerTool.bind(modelContext) }
}

/** この環境で WebMCP が使えるか。画面の出し分けには使わない（診断用）。 */
export const hasModelContext = (doc: unknown): boolean => modelContextOf(doc) !== undefined

const describeDocument = (deps: WebMcpDeps): string => {
  const current = deps.readDocument()
  if (current === null) return '文書を開いていません。エディタの画面で試してください。'
  return `種別: ${current.kind}\n---\n${current.text}`
}

const describeDiagnostics = (deps: WebMcpDeps): string => {
  const diagnostics = deps.diagnose()
  if (diagnostics.length === 0) return '問題はありません。'
  return diagnostics.map((one) => `${one.line} 行目 ${one.column} 列: ${one.message}`).join('\n')
}

const describeList = (deps: WebMcpDeps): string => {
  const documents = deps.listDocuments()
  if (documents.length === 0) return '文書がありません。'
  return documents.map((one) => `${one.id}\t${one.kind}\t${one.title}`).join('\n')
}

const documentTools = (deps: WebMcpDeps): readonly WebMcpTool[] => [
  {
    name: 'read-document',
    description: 'いま開いている文書の本文と種別（markdown / yaml / toml / json）を返す。',
    inputSchema: NO_INPUT,
    execute: () => Promise.resolve(textResult(describeDocument(deps))),
  },
  {
    name: 'diagnose-document',
    description: 'いま開いている文書の構文エラーなどの指摘を、行・列つきで返す。',
    inputSchema: NO_INPUT,
    execute: () => Promise.resolve(textResult(describeDiagnostics(deps))),
  },
  {
    name: 'list-documents',
    description: 'この端末で読み込み済みの文書一覧（id / 種別 / タイトル）を返す。',
    inputSchema: NO_INPUT,
    execute: () => Promise.resolve(textResult(describeList(deps))),
  },
  {
    name: 'propose-edit',
    description:
      '文書の書き換えを提案する。差分が画面に出るだけで、人が「適用」を押すまで文書は変わらない。',
    inputSchema: PROPOSE_INPUT,
    execute: (input) => {
      const text: unknown = input['text']
      if (typeof text !== 'string') {
        return Promise.resolve(textResult('text に文字列を渡してください。何も提案していません。'))
      }
      deps.proposeEdit(text)
      return Promise.resolve(
        textResult('編集の提案を画面に出しました。適用するかどうかは利用者が決めます。'),
      )
    },
  },
]

/**
 * 4 つのツールを登録し、**まとめて解除する関数**を返す。
 *
 * - WebMCP 非対応環境では何もせず、呼んでも安全な解除関数を返す
 * - `registerTool` が reject しても（`NotAllowedError` を含む）例外を投げない。
 *   ツールが登録できないことでアプリ本体が壊れてはいけない
 */
export const registerDocumentTools = (
  deps: WebMcpDeps,
  doc: unknown = globalThis.document,
): (() => void) => {
  const context = modelContextOf(doc)
  if (context === undefined) return () => {}

  const controller = new AbortController()
  for (const tool of documentTools(deps)) {
    void Promise.resolve(context.registerTool(tool, { signal: controller.signal })).catch(() => {
      // 登録できないだけ。アプリ本体の動作は変えない
    })
  }
  return () => controller.abort()
}

/**
 * `list-documents` が返す一覧の置き場所。
 *
 * ツールから Worker を呼ばない（ADR-0012 / 無料枠）ため、一覧画面が読んだ
 * ものをそのまま預けておき、エディタ画面から読み出す。
 */
export const DOCUMENT_LIST_KEY = 'noter-webmcp-documents'

/** sessionStorage は private モードや設定で落ちる。覚えられなくても画面は動く。 */
export const rememberDocumentList = (list: readonly WebMcpDocumentSummary[]): void => {
  try {
    globalThis.sessionStorage.setItem(DOCUMENT_LIST_KEY, JSON.stringify(list))
  } catch {
    // 覚えられないだけ。list-documents が空を返す
  }
}

const parseSummary = (value: unknown): WebMcpDocumentSummary | undefined => {
  if (typeof value !== 'object' || value === null) return undefined
  const id: unknown = Reflect.get(value, 'id')
  const title: unknown = Reflect.get(value, 'title')
  const kind: unknown = Reflect.get(value, 'kind')
  if (typeof id !== 'string' || typeof title !== 'string' || typeof kind !== 'string') {
    return undefined
  }
  const parsed = parseDocumentKind(kind)
  return parsed.ok ? { id, title, kind: parsed.value } : undefined
}

export const recallDocumentList = (): readonly WebMcpDocumentSummary[] => {
  try {
    const raw = globalThis.sessionStorage.getItem(DOCUMENT_LIST_KEY)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((entry: unknown) => {
      const summary = parseSummary(entry)
      return summary === undefined ? [] : [summary]
    })
  } catch {
    return []
  }
}
