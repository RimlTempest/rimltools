import { useId, useState } from 'react'
import type { Actor, ShareExpiry, SharePermission } from '@qrcc/auth/contract'
import { MAX_SHARE_DAYS, SHARE_DAYS_DEFAULT, describeShareDenial } from '@qrcc/auth/contract'
import type { ShareLink } from '@qrcc/manage/contract'
import { shareUrl } from '@qrcc/manage/contract'
import type { ShareDraftError } from '@qrcc/manage/core'
import { Button, Window } from '@qrcc/ui'
import { formatDate } from './format.ts'

/** 期限の選択肢。ゲストが選べない「期限なし」も**隠さずに**出し、理由を添える。 */
const EXPIRY_OPTIONS = [
  { value: 'default', label: `${SHARE_DAYS_DEFAULT} 日で期限切れ` },
  { value: 'max', label: `${MAX_SHARE_DAYS} 日で期限切れ` },
  { value: 'forever', label: '期限なし' },
] as const

type ExpiryChoice = (typeof EXPIRY_OPTIONS)[number]['value']

const toExpiry = (choice: ExpiryChoice): ShareExpiry => {
  switch (choice) {
    case 'default':
      return { kind: 'days', days: SHARE_DAYS_DEFAULT }
    case 'max':
      return { kind: 'days', days: MAX_SHARE_DAYS }
    case 'forever':
      return { kind: 'forever' }
  }
}

type SharePanelProps = {
  readonly actor: Actor
  readonly shares: readonly ShareLink[]
  readonly origin: string
  readonly busy: boolean
  readonly onCreate: (permission: SharePermission, expiry: ShareExpiry) => void
  readonly onRevoke: (share: ShareLink) => void
  readonly onCopy: (url: string) => void
}

export const describeShareDraftError = (error: ShareDraftError): string =>
  error.kind === 'token_generation_failed'
    ? '共有リンクを発行できませんでした。ページを読み込み直してからもう一度お試しください。'
    : describeShareDenial(error)

/**
 * 共有リンクの発行と取り消し。
 *
 * ゲストの制約は**選ぶ前**に伝える。選んでから断られるのは、
 * なぜ断られたのかが分からず体験が悪い（`@qrcc/auth` の share-policy と同じ考え方）。
 */
export const SharePanel = ({
  actor,
  shares,
  origin,
  busy,
  onCreate,
  onRevoke,
  onCopy,
}: SharePanelProps) => {
  const [permission, setPermission] = useState<SharePermission>('view')
  const [expiry, setExpiry] = useState<ExpiryChoice>('default')
  const permissionGroup = useId()
  const expiryId = useId()
  const isGuest = actor.kind === 'guest'

  return (
    <Window title="共有リンク">
      <p>
        リンクを知っている人が、サインインしなくてもこのコードを開けるようになります。
        取り消すと、そのリンクはすぐに使えなくなります。
      </p>
      {isGuest ? (
        <p>
          ゲストのままでは、編集できるリンクと期限なしのリンクは作れません。 Google
          で続けると作れるようになります。
        </p>
      ) : undefined}

      <form
        onSubmit={(event) => {
          event.preventDefault()
          onCreate(permission, toExpiry(expiry))
        }}
      >
        <fieldset>
          <legend>できること</legend>
          <label>
            <input
              type="radio"
              name={permissionGroup}
              checked={permission === 'view'}
              onChange={() => setPermission('view')}
            />
            見るだけ
          </label>
          <label>
            <input
              type="radio"
              name={permissionGroup}
              checked={permission === 'edit'}
              // ゲストが選べないことを、押せる形にしてから断るのではなく先に示す
              disabled={isGuest}
              onChange={() => setPermission('edit')}
            />
            編集もできる
          </label>
        </fieldset>

        <div className="qrcc-field">
          <label className="qrcc-field__label" htmlFor={expiryId}>
            共有リンクの期限
          </label>
          <select
            id={expiryId}
            className="qrcc-field__control"
            value={expiry}
            onChange={(event) =>
              setExpiry(
                EXPIRY_OPTIONS.find((option) => option.value === event.target.value)?.value
                  ?? 'default',
              )
            }
          >
            {EXPIRY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <Button type="submit" busy={busy}>
          共有リンクを作る
        </Button>
      </form>

      {shares.length === 0 ? (
        <p>まだ共有リンクはありません。</p>
      ) : (
        <ul className="qrcc-share-list">
          {shares.map((share) => {
            const url = shareUrl(origin, share.token)
            const created = formatDate(share.createdAt)
            return (
              <li key={share.token}>
                {/* URL は読み上げ・選択・コピーのすべてでそのまま扱えるテキストにする */}
                <p className="qrcc-share-list__url">{url}</p>
                <p>
                  {share.permission === 'edit' ? '編集もできる' : '見るだけ'} ・{' '}
                  {share.expiresAt === undefined
                    ? '期限なし'
                    : `${formatDate(share.expiresAt)}まで`}
                </p>
                <div className="qrcc-share-list__actions">
                  <Button variant="secondary" busy={busy} onClick={() => onCopy(url)}>
                    {created}に作ったリンクをコピー
                  </Button>
                  <Button variant="danger" busy={busy} onClick={() => onRevoke(share)}>
                    {created}に作ったリンクを取り消す
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Window>
  )
}
