import type { ReactNode } from 'react'
import { useState, useSyncExternalStore } from 'react'
import { DOCUMENT_KINDS } from '@noter/contract'
import type { DocumentId, Result } from '@noter/contract'
import type { Actor } from '@noter/auth/contract'
import { Button, LiveRegion } from '@noter/ui'
import type { DocumentSummary } from '../contract/document.ts'
import type { DocumentError } from '../contract/errors.ts'
import { describeDocumentError } from '../contract/errors.ts'
import { KIND_LABEL, ROLE_LABEL, formatDateTime } from './labels.ts'

export type DocumentLinkRenderer = (input: {
  readonly documentId: DocumentId
  readonly title: string
}) => ReactNode

export type HomeActions = {
  readonly remove: (documentId: DocumentId) => Promise<Result<void, DocumentError>>
}

type HomeScreenProps = {
  readonly actor: Actor
  readonly documents: readonly DocumentSummary[]
  readonly actions: HomeActions
  readonly renderDocumentLink?: DocumentLinkRenderer
  /** 既定はブラウザの `localStorage` を読む。テストでは直接渡す。 */
  readonly guestNoticeDismissed?: boolean
  readonly onDismissGuestNotice?: () => void
  readonly onChanged?: () => void
}

/** ゲスト向けの案内を消したことを覚えるキー。 */
export const GUEST_NOTICE_KEY = 'noter-guest-notice-dismissed'

const defaultDocumentLink: DocumentLinkRenderer = ({ documentId, title }) => (
  <a href={`/d/${documentId}`}>{title}</a>
)

const neverChanges = () => () => {}

/** `localStorage` はプライベートモードなどで例外を投げる。読めなければ「消していない」。 */
const readDismissed = (): boolean => {
  try {
    return globalThis.localStorage?.getItem(GUEST_NOTICE_KEY) === '1'
  } catch {
    return false
  }
}

const writeDismissed = (): void => {
  try {
    globalThis.localStorage?.setItem(GUEST_NOTICE_KEY, '1')
  } catch {
    // 覚えられなくても案内は閉じる。次に開いたときにまた出るだけ
  }
}

/**
 * ホーム（文書一覧、docs/design/ux.md §4.1）。
 *
 * 新規作成は **素の `<form method="post">`** で `/new` を叩く。JavaScript が
 * 落ちていても文書を作れることが「開いた瞬間に書ける」（§2 原則 1）の前提。
 *
 * 最終更新は相対時刻ではなく `<time datetime>` + 可視の絶対時刻にする
 * （ホバーやフォーカスを要求しない）。
 */
export const HomeScreen = ({
  actor,
  documents,
  actions,
  renderDocumentLink = defaultDocumentLink,
  guestNoticeDismissed,
  onDismissGuestNotice,
  onChanged,
}: HomeScreenProps) => {
  // 案内の表示は localStorage 次第なのでサーバでは決められない。
  // ハイドレーション後にだけ出す（SSR の出力と食い違わせない）
  const isHydrated = useSyncExternalStore(
    neverChanges,
    () => true,
    () => false,
  )
  const [dismissed, setDismissed] = useState(false)
  const [confirming, setConfirming] = useState<DocumentId | undefined>(undefined)
  const [message, setMessage] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  // 引数は初期値。閉じたあとは常に閉じたまま
  const wasDismissed = guestNoticeDismissed ?? (isHydrated ? readDismissed() : true)
  const showGuestNotice = actor.kind === 'guest' && isHydrated && !wasDismissed && !dismissed

  const dismissNotice = () => {
    setDismissed(true)
    writeDismissed()
    onDismissGuestNotice?.()
  }

  const remove = async (summary: DocumentSummary) => {
    setBusy(true)
    const result = await actions.remove(summary.id)
    setBusy(false)
    setConfirming(undefined)
    setMessage(
      result.ok ? `「${summary.title}」を削除しました。` : describeDocumentError(result.error),
    )
    if (result.ok) onChanged?.()
  }

  return (
    <>
      <h1>文書一覧</h1>

      {actor.kind === 'visitor' ? (
        <p>
          noter は Markdown / YAML / TOML / JSON
          を複数人で同時に編集できます。ログインしなくても、下のボタンからすぐ書き始められます。
        </p>
      ) : undefined}

      <h2>新規作成</h2>
      <form className="noter-doc-create" method="post" action="/new">
        <fieldset>
          <legend>種別を選んで作成します</legend>
          <div className="noter-doc-create__choices">
            {DOCUMENT_KINDS.map((kind) => (
              <Button key={kind} type="submit" name="kind" value={kind} variant="secondary">
                {`${KIND_LABEL[kind]} で始める`}
              </Button>
            ))}
          </div>
        </fieldset>
      </form>

      {actor.kind === 'visitor' ? (
        <p>
          すでに Google アカウントで使っている場合は <a href="/sign-in">Google でログイン</a>
          してください。
        </p>
      ) : undefined}

      {showGuestNotice ? (
        <aside className="noter-doc-notice" aria-label="ゲスト利用の案内">
          <p>
            いまはゲストとして使っています。文書はこの端末のブラウザに紐づいています。別の端末でも開くには{' '}
            <a href="/sign-in">Google でログイン</a> してください。文書はそのまま引き継がれます。
          </p>
          <Button variant="secondary" onClick={dismissNotice}>
            この案内を閉じる
          </Button>
        </aside>
      ) : undefined}

      {documents.length === 0 ? (
        <p>まだ文書がありません。上の「Markdown で始める」などから作成できます。</p>
      ) : (
        <table className="noter-doc-table">
          <caption>最近の文書</caption>
          <thead>
            <tr>
              <th scope="col">タイトル</th>
              <th scope="col">種別</th>
              <th scope="col">権限</th>
              <th scope="col">最終更新</th>
              <th scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((summary) => (
              <tr key={summary.id}>
                <th scope="row">
                  {renderDocumentLink({ documentId: summary.id, title: summary.title })}
                </th>
                <td>
                  <span className="noter-doc-badge">{KIND_LABEL[summary.kind]}</span>
                </td>
                <td>{ROLE_LABEL[summary.role]}</td>
                <td>
                  <time dateTime={summary.updatedAt.toISOString()}>
                    {formatDateTime(summary.updatedAt)}
                  </time>
                </td>
                <td>
                  {summary.role !== 'owner' ? (
                    <span className="noter-doc-hint">所有者のみ削除できます</span>
                  ) : confirming === summary.id ? (
                    <span className="noter-doc-confirm">
                      <span>削除すると一覧から消えます。</span>
                      <Button variant="danger" busy={busy} onClick={() => void remove(summary)}>
                        削除する
                      </Button>
                      <Button variant="secondary" onClick={() => setConfirming(undefined)}>
                        やめる
                      </Button>
                    </span>
                  ) : (
                    <Button variant="secondary" onClick={() => setConfirming(summary.id)}>
                      {`「${summary.title}」を削除`}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <LiveRegion message={message} />
    </>
  )
}
