import type { FormEvent } from 'react'
import { useState, useSyncExternalStore } from 'react'
import { MAX_DISPLAY_NAME } from '@noter/contract'
import { Breadcrumbs } from '@noter/shell/ui'
import type { NavItem, NavLinkRenderer } from '@noter/shell/ui'
import { Button, Field, LiveRegion, ThemeToggle, makeThemeStore } from '@noter/ui'
import type { ThemeStore } from '@noter/ui'
import type { Actor } from '../contract/actor.ts'
import type { AuthActionResult, AuthActions } from './auth-actions.ts'
import { describeAuthActionError } from './auth-actions.ts'
import { GUEST_SESSION_DAYS } from './guest-guide.ts'

type AccountSettingsScreenProps = {
  readonly actor: Actor
  readonly actions: AuthActions
  readonly isGoogleAvailable?: boolean
  /** 既定はブラウザの localStorage と documentElement。テストでは偽物を渡す。 */
  readonly themeStore?: ThemeStore
  readonly renderLink?: NavLinkRenderer
  readonly onChanged?: () => void
}

const TRAIL: readonly NavItem[] = [
  { to: '/', label: '文書一覧' },
  { to: '/settings/account', label: 'アカウント設定' },
]

const GOOGLE_UNAVAILABLE =
  'この環境では Google ログインを利用できません。ゲストのまま続けられます。'

const formatDate = (date: Date): string =>
  new Intl.DateTimeFormat('ja-JP', { dateStyle: 'long' }).format(date)

const browserThemeStore = (): ThemeStore =>
  makeThemeStore(globalThis.localStorage, globalThis.document.documentElement)

const neverChanges = () => () => {}

/**
 * アカウント設定（docs/design/ux.md §3）。
 *
 * 置くのは **表示名 / ログイン方法 / 外観** の 3 つだけ。
 * アカウント削除は v1 では置かない。
 *
 * テーマの現在値は localStorage にあり、サーバ側では読めない。
 * SSR の出力とハイドレーション後の表示が食い違わないよう、
 * ハイドレーション後にだけ実ストアを作る（テストでは `themeStore` を直接渡す）。
 */
export const AccountSettingsScreen = ({
  actor,
  actions,
  isGoogleAvailable = true,
  themeStore,
  renderLink,
  onChanged,
}: AccountSettingsScreenProps) => {
  const isHydrated = useSyncExternalStore(
    neverChanges,
    () => true,
    () => false,
  )
  const store = themeStore ?? (isHydrated ? browserThemeStore() : undefined)

  const [displayName, setDisplayName] = useState(actor.kind === 'visitor' ? '' : actor.displayName)
  const [message, setMessage] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  const run = async (action: () => Promise<AuthActionResult>, success: string) => {
    setBusy(true)
    const result = await action()
    setBusy(false)
    setMessage(result.ok ? success : describeAuthActionError(result.error))
    if (result.ok) onChanged?.()
  }

  const submitDisplayName = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void run(() => actions.updateDisplayName(displayName), '表示名を変更しました。')
  }

  return (
    <>
      <Breadcrumbs trail={TRAIL} {...(renderLink === undefined ? {} : { renderLink })} />
      <h1>アカウント設定</h1>

      <h2>表示名</h2>
      {actor.kind === 'visitor' ? (
        <p>ログインすると表示名を設定できます。</p>
      ) : (
        <form className="noter-auth-form" onSubmit={submitDisplayName}>
          <Field
            label="表示名"
            hint={`一緒に編集している人に見えます。${MAX_DISPLAY_NAME} 文字以内。`}
            name="displayName"
            value={displayName}
            maxLength={MAX_DISPLAY_NAME}
            autoComplete="nickname"
            onChange={(event) => setDisplayName(event.target.value)}
          />
          <Button type="submit" busy={busy}>
            表示名を変更
          </Button>
        </form>
      )}

      <h2>ログイン方法</h2>
      <div className="noter-auth-choices">
        {actor.kind === 'user' ? (
          <p>Google アカウントと連携しています。文書はどの端末からでも開けます。</p>
        ) : undefined}
        {actor.kind === 'guest' ? (
          <p>
            ゲストとして利用中です。この端末のデータは {formatDate(actor.sessionExpiresAt)}
            まで残ります（操作を続けると {GUEST_SESSION_DAYS} 日ずつ延びます）。 Google
            でログインすると、文書はそのまま引き継がれます。
          </p>
        ) : undefined}
        {actor.kind === 'visitor' ? <p>ログインしていません。</p> : undefined}

        {actor.kind === 'guest' && !isGoogleAvailable ? <p>{GOOGLE_UNAVAILABLE}</p> : undefined}
        {actor.kind === 'guest' && isGoogleAvailable ? (
          <Button
            busy={busy}
            onClick={() => void run(actions.signInWithGoogle, 'Google のページへ移動します。')}
          >
            Google でログイン
          </Button>
        ) : undefined}

        {actor.kind === 'visitor' ? undefined : (
          <Button
            variant="secondary"
            busy={busy}
            onClick={() => void run(actions.signOut, 'ログアウトしました。')}
          >
            ログアウト
          </Button>
        )}
      </div>

      <LiveRegion message={message} />

      <h2>外観</h2>
      <p>既定ではお使いの端末の設定に従います。明示的に選ぶと、この端末にだけ記憶されます。</p>
      {store === undefined ? (
        <noscript>
          <p>テーマの切り替えには JavaScript が必要です。端末の外観設定はそのまま反映されます。</p>
        </noscript>
      ) : (
        <ThemeToggle store={store} />
      )}
    </>
  )
}
