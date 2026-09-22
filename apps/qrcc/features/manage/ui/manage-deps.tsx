/**
 * 画面が必要とする依存の一式。
 *
 * 実体（server function・`crypto`・クリップボード）は `*.route.tsx` が組み立てて
 * 渡す。画面はこの型しか知らないので、テストでは素のオブジェクトで差し替えられる
 * （.claude/skills/rimltools-typescript の関数DI）。
 */
import type { CodeId, FolderId, IdParseError, Result } from '@qrcc/contract'
import type { CreateShareDraft } from '@qrcc/manage/core'
import type { ManageApi } from '@qrcc/manage/server'

export type ManageDeps = {
  readonly api: ManageApi
  /** 保存前に qrcc-web 側で ID を発行する。qrcc-api は乱数源を持たない。 */
  readonly newCodeId: () => Result<CodeId, IdParseError>
  readonly newFolderId: () => Result<FolderId, IdParseError>
  /** 作成の再送で二重に作らないための鍵。操作 1 回につき 1 つ。 */
  readonly newIdempotencyKey: () => string
  readonly createShareDraft: CreateShareDraft
  /** 共有リンクの URL を組み立てるための現在のオリジン。 */
  readonly origin: string
  /** クリップボードへのコピー。成功したかを返す。 */
  readonly copyText: (text: string) => Promise<boolean>
}

/**
 * リンクの描画方法。既定は素の `<a>`。
 *
 * ルータを画面が直接 import すると、テストのたびに RouterProvider が要る。
 * 描画方法を引数で受け取ることで避けている。
 */
export type CodeLinkRenderer = (props: {
  readonly to: string
  readonly label: string
}) => React.ReactNode

export const defaultRenderLink: CodeLinkRenderer = ({ to, label }) => <a href={to}>{label}</a>
