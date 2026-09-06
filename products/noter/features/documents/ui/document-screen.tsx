import type { FormEvent } from 'react'
import { useMemo, useState } from 'react'
import { MAX_TITLE_LENGTH } from '@noter/contract'
import type { Result, Role } from '@noter/contract'
import type { Actor } from '@noter/auth/contract'
import { Breadcrumbs } from '@noter/shell/ui'
import type { NavItem, NavLinkRenderer } from '@noter/shell/ui'
import { Button, Field, LiveRegion } from '@noter/ui'
import type { DocumentHeader, MemberSummary, ShareLinkView } from '../contract/document.ts'
import type { DocumentError } from '../contract/errors.ts'
import { describeDocumentError } from '../contract/errors.ts'
import { can } from '../core/permission.ts'
import { KIND_LABEL, ROLE_LABEL } from './labels.ts'
import { ShareDialog } from './share-dialog.tsx'
import type { ShareActions } from './share-dialog.tsx'

export type DocumentActions = {
  readonly rename: (title: string) => Promise<Result<string, DocumentError>>
  readonly remove: () => Promise<Result<void, DocumentError>>
  readonly leave: () => Promise<Result<void, DocumentError>>
}

type DocumentScreenProps = {
  readonly actor: Actor
  readonly document: DocumentHeader
  /** この人の権限。`role` にすると JSX の ARIA ロールと紛らわしいので名前を変えてある。 */
  readonly actorRole: Role
  readonly members: readonly MemberSummary[]
  readonly links: readonly ShareLinkView[]
  readonly origin: string
  readonly actions: DocumentActions
  readonly shareActions: ShareActions
  readonly renderLink?: NavLinkRenderer
  readonly onChanged?: () => void
  /** 削除・退出のあと。ルータへの依存を持たないよう呼び出し側に任せる。 */
  readonly onLeft?: () => void
}

type Pending = 'none' | 'remove' | 'leave'

/**
 * 文書の画面（暫定）。
 *
 * **plan 005 が `features/editor` の本物に置き換える。** ここでは
 * 「誰が・どの権限で開いているか」と、表題の変更・共有・削除・退出という
 * plan 004 が持つ操作だけを出す。本文の編集はまだ無いことを明示する
 * （空の画面を出すと壊れているのか未実装なのか区別が付かない）。
 */
export const DocumentScreen = ({
  actor,
  document,
  actorRole,
  members,
  links,
  origin,
  actions,
  shareActions,
  renderLink,
  onChanged,
  onLeft,
}: DocumentScreenProps) => {
  const [title, setTitle] = useState(document.title)
  const [message, setMessage] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [pending, setPending] = useState<Pending>('none')

  const trail: readonly NavItem[] = useMemo(
    () => [
      { to: '/', label: '文書一覧' },
      { to: `/d/${document.id}`, label: document.title },
    ],
    [document.id, document.title],
  )

  const run = async (
    action: () => Promise<Result<unknown, DocumentError>>,
    success: string,
    after?: () => void,
  ) => {
    setBusy(true)
    const result = await action()
    setBusy(false)
    setPending('none')
    setMessage(result.ok ? success : describeDocumentError(result.error))
    if (result.ok) after?.()
  }

  const submitTitle = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void run(() => actions.rename(title), '表題を変更しました。', onChanged)
  }

  return (
    <>
      <Breadcrumbs trail={trail} {...(renderLink === undefined ? {} : { renderLink })} />
      <h1>{document.title}</h1>

      <p className="noter-doc-meta">
        <span className="noter-doc-badge">{KIND_LABEL[document.kind]}</span>
        <span>{`あなたの権限: ${ROLE_LABEL[actorRole]}`}</span>
      </p>

      <p>
        エディタは準備中です。本文の同時編集は次の更新で使えるようになります。いまは表題の変更と共有だけができます。
      </p>
      <p>
        <a href={`/d/${document.id}/raw`}>この文書の本文をそのまま表示する</a>
      </p>

      {can(actorRole, 'rename') ? (
        <form className="noter-doc-rename" onSubmit={submitTitle}>
          <Field
            label="文書のタイトル"
            hint={`${MAX_TITLE_LENGTH} 文字以内。一緒に編集している人にも見えます。`}
            name="title"
            value={title}
            maxLength={MAX_TITLE_LENGTH}
            onChange={(event) => setTitle(event.target.value)}
          />
          <Button type="submit" busy={busy}>
            表題を変更
          </Button>
        </form>
      ) : (
        <p>閲覧のみの権限です。表題や本文は変更できません。</p>
      )}

      <div className="noter-doc-actions">
        {can(actorRole, 'share') ? (
          <Button onClick={() => setShareOpen(true)}>共有</Button>
        ) : undefined}

        {can(actorRole, 'delete') && pending === 'remove' ? (
          <>
            <span>削除すると一覧から消え、共有した人も開けなくなります。</span>
            <Button
              variant="danger"
              busy={busy}
              onClick={() => void run(actions.remove, '文書を削除しました。', onLeft)}
            >
              削除する
            </Button>
            <Button variant="secondary" onClick={() => setPending('none')}>
              やめる
            </Button>
          </>
        ) : undefined}
        {can(actorRole, 'delete') && pending !== 'remove' ? (
          <Button variant="danger" onClick={() => setPending('remove')}>
            この文書を削除
          </Button>
        ) : undefined}

        {actorRole === 'owner' ? undefined : pending === 'leave' ? (
          <>
            <span>退出すると、もう一度共有リンクをもらうまで開けなくなります。</span>
            <Button
              variant="danger"
              busy={busy}
              onClick={() => void run(actions.leave, 'この文書から退出しました。', onLeft)}
            >
              退出する
            </Button>
            <Button variant="secondary" onClick={() => setPending('none')}>
              やめる
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={() => setPending('leave')}>
            この文書から退出
          </Button>
        )}
      </div>

      <LiveRegion message={message} />

      {can(actorRole, 'share') ? (
        <ShareDialog
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          actor={actor}
          ownerId={document.ownerId}
          origin={origin}
          links={links}
          members={members}
          actions={shareActions}
          {...(onChanged === undefined ? {} : { onChanged })}
        />
      ) : undefined}
    </>
  )
}
