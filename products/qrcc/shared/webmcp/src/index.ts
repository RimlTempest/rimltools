/**
 * @qrcc/webmcp — WebMCP（`document.modelContext`）への登録層（docs/adr/0010-webmcp.md）。
 *
 * WebMCP は 2026-09 時点で Origin Trial 段階（Chrome 149 / Edge 150）で、
 * 既定ではどのブラウザでも有効になっていない。この層は「API があれば登録し、
 * 無ければ何もしない」形にすることで、**API が無い環境で挙動が一切変わらない**
 * ことを保証する。
 *
 * DOM には触らない純粋な登録層。`browserModelContext` だけが DOM を見る。
 */
import type { Result } from '@qrcc/contract'
import { err, ok } from '@qrcc/contract'

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

export type WebMcpRegisterError = {
  readonly kind: 'register_failed'
  readonly detail: string
}

/** ツールが返す本文を組み立てるだけの補助。 */
export const textResult = (text: string): WebMcpToolResult => ({
  content: [{ type: 'text', text }],
})

/**
 * ツールをまとめて登録する。
 *
 * - `context` が `undefined`（WebMCP 非対応環境）なら、**何もせず**成功を返す。
 * - `registerTool` が reject しても（`NotAllowedError` を含む）例外は投げず、
 *   失敗を値で返す。
 * - 成功したら、全ツールをまとめて解除できる関数を返す。
 */
export const registerTools = async (
  context: ModelContext | undefined,
  tools: readonly WebMcpTool[],
): Promise<Result<() => void, WebMcpRegisterError>> => {
  if (context === undefined) return ok(() => {})

  const controller = new AbortController()
  try {
    await Promise.all(
      tools.map((tool) => context.registerTool(tool, { signal: controller.signal })),
    )
  } catch (cause) {
    return err({ kind: 'register_failed', detail: String(cause) })
  }
  return ok(() => controller.abort())
}

/**
 * 実行環境の `document.modelContext`。
 *
 * 標準の型定義にまだ無いグローバルなので `Reflect.get` で取り出し、
 * 形は `typeof` だけで確かめる（`as` は使わない）。SSR とハイドレーション前は
 * `document` が無い（または `modelContext` を持たない）ので、必ず
 * `undefined` を返す。
 */
export const browserModelContext = (): ModelContext | undefined => {
  if (typeof document === 'undefined') return undefined

  const modelContext: unknown = Reflect.get(document, 'modelContext')
  if (typeof modelContext !== 'object' || modelContext === null) return undefined

  const registerTool: unknown = Reflect.get(modelContext, 'registerTool')
  if (typeof registerTool !== 'function') return undefined

  return { registerTool: registerTool.bind(modelContext) }
}
