import type { FormEvent } from 'react'
import { useRef, useState } from 'react'
import { MAX_TITLE_LENGTH } from '@noter/contract'
import type { Result, Role } from '@noter/contract'
import type { DocumentError, DocumentHeader } from '@noter/documents/contract'
import { describeDocumentError } from '@noter/documents/contract'
import { can } from '@noter/documents/core'
import { KIND_LABEL, ROLE_LABEL } from '@noter/documents/ui'
import { Button, VisuallyHidden } from '@noter/ui'
import type { DocumentActions } from '../contract/actions.ts'
import type { Peer } from '../contract/peer.ts'
import type { StatusText } from '../contract/status.ts'
import { ConfirmDialog } from './confirm-dialog.tsx'
import { Presence } from './presence.tsx'
import { StatusPill } from './status-pill.tsx'

type EditorHeaderProps = {
  readonly document: DocumentHeader
  /** この人の権限。`role` にすると JSX の ARIA ロールと紛らわしいので名前を変えてある。 */
  readonly actorRole: Role
  readonly status: StatusText
  readonly peers: readonly Peer[]
  readonly actions: DocumentActions
  /** 画面にただ 1 つある live region へ流す。 */
  readonly onAnnounce: (message: string) => void
  /** 共有ダイアログを開く。渡されないときはボタンを出さない（owner 以外）。 */
  readonly onShare?: () => void
  readonly onChanged?: () => void
  /** 削除・退出のあと。ルータへの依存を持たないよう呼び出し側に任せる。 */
  readonly onLeft?: () => void
}

type Pending = 'none' | 'remove' | 'leave'

/**
 * エディタ画面のヘッダー（docs/design/ux.md §4.2）。
 *
 * タイトル・種別・状態・参加者・共有・その他の操作。**本文には触らない**ので
 * CodeMirror なしで動き、そのままテストできる。
 *
 * 見出しは常に 1 つ置く。編集できる人にはタイトルが `<input>` になるが、
 * それだけだとページに `h1` が無くなってしまう（axe の best-practice）。
 */
export const EditorHeader = ({
  document,
  actorRole,
  status,
  peers,
  actions,
  onAnnounce,
  onShare,
  onChanged,
  onLeft,
}: EditorHeaderProps) => {
  const titleRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDetailsElement>(null)
  const [title, setTitle] = useState(document.title)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<Pending>('none')

  const canRename = can(actorRole, 'rename')

  const run = async (
    action: () => Promise<Result<unknown, DocumentError>>,
    success: string,
    after?: () => void,
  ): Promise<void> => {
    setBusy(true)
    const result = await action()
    setBusy(false)
    setPending('none')
    onAnnounce(result.ok ? success : describeDocumentError(result.error))
    if (result.ok) after?.()
  }

  const closeMenu = (): void => {
    menuRef.current?.removeAttribute('open')
  }

  const saveTitle = (): void => {
    const next = title.trim()
    // 変えていないなら送らない（開いただけで D1 に書き込ませない）
    if (next === document.title) return
    void run(() => actions.rename(next), '表題を変更しました。', onChanged)
  }

  const submitTitle = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    saveTitle()
  }

  return (
    <div className="noter-editor-header">
      {canRename ? (
        <>
          <VisuallyHidden as="h1">{document.title}</VisuallyHidden>
          <form className="noter-editor-header__title" onSubmit={submitTitle}>
            <input
              ref={titleRef}
              type="text"
              aria-label="文書のタイトル"
              value={title}
              maxLength={MAX_TITLE_LENGTH}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={saveTitle}
            />
          </form>
        </>
      ) : (
        <h1 className="noter-editor-header__title">{document.title}</h1>
      )}

      <p className="noter-editor-header__meta">
        <span className="noter-doc-badge">{KIND_LABEL[document.kind]}</span>
        <span>{`あなたの権限: ${ROLE_LABEL[actorRole]}`}</span>
      </p>

      <StatusPill status={status} />
      <Presence peers={peers} />

      {onShare === undefined ? undefined : (
        <Button variant="secondary" onClick={onShare}>
          共有
        </Button>
      )}

      <details className="noter-menu" ref={menuRef}>
        <summary className="noter-menu__summary">その他の操作</summary>
        <ul className="noter-menu__items">
          {canRename ? (
            <li>
              <button
                type="button"
                onClick={() => {
                  closeMenu()
                  titleRef.current?.focus()
                }}
              >
                表題を変更
              </button>
            </li>
          ) : undefined}
          <li>
            <button
              type="button"
              onClick={() => {
                closeMenu()
                globalThis.print()
              }}
            >
              印刷
            </button>
          </li>
          {can(actorRole, 'delete') ? (
            <li>
              <button
                type="button"
                onClick={() => {
                  closeMenu()
                  setPending('remove')
                }}
              >
                この文書を削除
              </button>
            </li>
          ) : undefined}
          {actorRole === 'owner' ? undefined : (
            <li>
              <button
                type="button"
                onClick={() => {
                  closeMenu()
                  setPending('leave')
                }}
              >
                この文書から退出
              </button>
            </li>
          )}
        </ul>
      </details>

      <ConfirmDialog
        open={pending === 'remove'}
        title="この文書を削除"
        description="削除すると一覧から消え、共有した人も開けなくなります。"
        confirmLabel="削除する"
        busy={busy}
        onConfirm={() => void run(actions.remove, '文書を削除しました。', onLeft)}
        onCancel={() => setPending('none')}
      />
      <ConfirmDialog
        open={pending === 'leave'}
        title="この文書から退出"
        description="退出すると、もう一度共有リンクをもらうまで開けなくなります。"
        confirmLabel="退出する"
        busy={busy}
        onConfirm={() => void run(actions.leave, 'この文書から退出しました。', onLeft)}
        onCancel={() => setPending('none')}
      />
    </div>
  )
}
