import type { FormEvent } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import type { Result, Role, ShareToken, UserId } from '@noter/contract'
import { SHARE_ROLES, allowedShareRoles, describeShareRoleDenial } from '@noter/auth/contract'
import type { Actor, ShareRole } from '@noter/auth/contract'
import { Button, LiveRegion } from '@noter/ui'
import type { MemberSummary, ShareLinkView } from '../contract/document.ts'
import type { DocumentError } from '../contract/errors.ts'
import { describeDocumentError } from '../contract/errors.ts'
import { SHARE_LINK_DAY_CHOICES } from '../core/share-link.ts'
import { ROLE_LABEL, formatDate } from './labels.ts'

export type ShareActions = {
  readonly createLink: (input: {
    readonly role: ShareRole
    readonly expiresInDays: number | undefined
  }) => Promise<Result<ShareLinkView, DocumentError>>
  readonly revokeLink: (token: ShareToken) => Promise<Result<void, DocumentError>>
  readonly removeMember: (userId: UserId) => Promise<Result<void, DocumentError>>
  readonly changeMemberRole: (userId: UserId, role: Role) => Promise<Result<void, DocumentError>>
  /** クリップボードへのコピー。成功したかを返す。 */
  readonly copyText: (text: string) => Promise<boolean>
}

type ShareDialogProps = {
  readonly open: boolean
  readonly onClose: () => void
  readonly actor: Actor
  readonly ownerId: UserId
  /** 共有リンクの URL を組み立てる基準。サーバから渡す。 */
  readonly origin: string
  readonly links: readonly ShareLinkView[]
  readonly members: readonly MemberSummary[]
  readonly actions: ShareActions
  readonly onChanged?: () => void
}

const UNLIMITED = 'unlimited'

const shareUrl = (origin: string, token: ShareToken): string => `${origin}/s/${token}`

type Pending =
  | { readonly kind: 'none' }
  | { readonly kind: 'revoke'; readonly token: ShareToken }
  | { readonly kind: 'remove'; readonly userId: UserId }

const NOTHING: Pending = { kind: 'none' }

/**
 * 共有ダイアログ（docs/design/ux.md §4.4）。owner だけが開ける。
 *
 * `<dialog>` + `showModal()` を使い、フォーカストラップと Esc を
 * ブラウザに任せる（自前でキーを拾わない）。
 *
 * 失効・参加者を外すは**確認を挟む**（AAA 3.3.6）。ux.md は Undo トーストを
 * 想定していたが、失効の取り消し・再招待にあたる操作が v1 の API に無いため、
 * 「取り消せる」ではなく「確認する」で AAA を満たす。
 */
export const ShareDialog = ({
  open,
  onClose,
  actor,
  ownerId,
  origin,
  links,
  members,
  actions,
  onChanged,
}: ShareDialogProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const expiryId = useId()

  const grantable = allowedShareRoles(actor)
  const [role, setRole] = useState<ShareRole>(grantable.includes('editor') ? 'editor' : 'viewer')
  const [expiry, setExpiry] = useState<string>(String(SHARE_LINK_DAY_CHOICES[2] ?? 90))
  const [message, setMessage] = useState<string | undefined>(undefined)
  const [copied, setCopied] = useState<string>('')
  const [pending, setPending] = useState<Pending>(NOTHING)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog === null) return
    if (open) {
      // showModal が無い環境（古いブラウザ・テスト）でも中身は見えるようにする
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
    } else if (typeof dialog.close === 'function') {
      dialog.close()
    } else {
      dialog.removeAttribute('open')
    }
  }, [open])

  const run = async (
    action: () => Promise<Result<unknown, DocumentError>>,
    success: string,
  ): Promise<void> => {
    setBusy(true)
    const result = await action()
    setBusy(false)
    setPending(NOTHING)
    setMessage(result.ok ? success : describeDocumentError(result.error))
    if (result.ok) onChanged?.()
  }

  const submitLink = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void run(
      () =>
        actions.createLink({
          role,
          expiresInDays: expiry === UNLIMITED ? undefined : Number(expiry),
        }),
      '共有リンクを作成しました。',
    )
  }

  const copy = async (token: ShareToken) => {
    const done = await actions.copyText(shareUrl(origin, token))
    setCopied(
      done ? 'コピーしました' : 'コピーできませんでした。URL を選択して手動でコピーしてください',
    )
  }

  return (
    <dialog
      className="noter-share-dialog"
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
    >
      <h2 id={titleId}>共有</h2>

      <form className="noter-share-form" onSubmit={submitLink}>
        <fieldset>
          <legend>リンクを知っている人の権限</legend>
          {SHARE_ROLES.filter((candidate) => grantable.includes(candidate)).map((candidate) => (
            <label key={candidate} className="noter-share-radio">
              <input
                type="radio"
                name="share-role"
                value={candidate}
                checked={role === candidate}
                onChange={() => setRole(candidate)}
              />
              {ROLE_LABEL[candidate]}
            </label>
          ))}
          {grantable.includes('editor') ? undefined : (
            <p>{describeShareRoleDenial({ kind: 'guest_cannot_grant_editor' })}</p>
          )}
        </fieldset>

        <div className="noter-share-expiry">
          <label htmlFor={expiryId}>有効期限</label>
          <select id={expiryId} value={expiry} onChange={(event) => setExpiry(event.target.value)}>
            {SHARE_LINK_DAY_CHOICES.map((days) => (
              <option key={days} value={String(days)}>{`${days} 日`}</option>
            ))}
            <option value={UNLIMITED}>無期限</option>
          </select>
        </div>

        <Button type="submit" busy={busy}>
          リンクを作成
        </Button>
      </form>

      <h3>有効なリンク</h3>
      {links.length === 0 ? (
        <p>有効なリンクはまだありません。上のボタンで作成してください。</p>
      ) : (
        <ul className="noter-share-links" aria-label="有効なリンク">
          {links.map((link) => (
            <li key={link.token}>
              <code>{shareUrl(origin, link.token)}</code>
              <span>{ROLE_LABEL[link.role]}</span>
              <span>
                {link.expiresAt === undefined ? '無期限' : `${formatDate(link.expiresAt)} まで`}
              </span>
              <Button variant="secondary" onClick={() => void copy(link.token)}>
                {`${ROLE_LABEL[link.role]}のリンクをコピー`}
              </Button>
              {pending.kind === 'revoke' && pending.token === link.token ? (
                <>
                  <span>失効するとこのリンクでは入れなくなります。</span>
                  <Button
                    variant="danger"
                    busy={busy}
                    onClick={() =>
                      void run(() => actions.revokeLink(link.token), 'リンクを失効しました。')
                    }
                  >
                    失効する
                  </Button>
                  <Button variant="secondary" onClick={() => setPending(NOTHING)}>
                    やめる
                  </Button>
                </>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => setPending({ kind: 'revoke', token: link.token })}
                >
                  {`${ROLE_LABEL[link.role]}のリンクを失効`}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <output className="noter-share-copied">{copied}</output>

      <h3>参加者</h3>
      <ul className="noter-share-members" aria-label="参加者">
        {members.map((member) => (
          <li key={member.userId}>
            <span>{member.displayName}</span>
            <span>{ROLE_LABEL[member.role]}</span>
            {member.userId === ownerId ? undefined : (
              <>
                {member.role === 'viewer' ? undefined : (
                  <Button
                    variant="secondary"
                    busy={busy}
                    onClick={() =>
                      void run(
                        () => actions.changeMemberRole(member.userId, 'viewer'),
                        `${member.displayName}さんを閲覧のみにしました。`,
                      )
                    }
                  >
                    {`${member.displayName}さんを閲覧のみにする`}
                  </Button>
                )}
                {pending.kind === 'remove' && pending.userId === member.userId ? (
                  <>
                    <span>外すとこの文書を開けなくなります。</span>
                    <Button
                      variant="danger"
                      busy={busy}
                      onClick={() =>
                        void run(
                          () => actions.removeMember(member.userId),
                          `${member.displayName}さんを外しました。`,
                        )
                      }
                    >
                      外す
                    </Button>
                    <Button variant="secondary" onClick={() => setPending(NOTHING)}>
                      やめる
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => setPending({ kind: 'remove', userId: member.userId })}
                  >
                    {`${member.displayName}さんを外す`}
                  </Button>
                )}
              </>
            )}
          </li>
        ))}
      </ul>

      <LiveRegion message={message} />

      <Button variant="secondary" onClick={onClose}>
        共有を閉じる
      </Button>
    </dialog>
  )
}
