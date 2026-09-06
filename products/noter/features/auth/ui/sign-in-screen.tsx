import { useId, useState } from 'react'
import { Button, LiveRegion } from '@noter/ui'
import type { Actor } from '../contract/actor.ts'
import type { AuthActionResult, AuthActions } from './auth-actions.ts'
import { describeAuthActionError } from './auth-actions.ts'
import { GUEST_SESSION_DAYS } from './guest-guide.ts'

type SignInScreenProps = {
  readonly actor: Actor
  readonly actions: AuthActions
  /** Google の資格情報が設定されているか。ローカル開発では未設定のことがある。 */
  readonly isGoogleAvailable?: boolean
  readonly onSignedIn?: () => void
  readonly onSignedOut?: () => void
}

const formatDate = (date: Date): string =>
  new Intl.DateTimeFormat('ja-JP', { dateStyle: 'long' }).format(date)

/** Google が使えない環境で出す説明。理由を書き、次にできることを示す（文言ルール §8）。 */
const GOOGLE_UNAVAILABLE =
  'この環境では Google ログインを利用できません。ゲストのまま続けられます。'

/**
 * ログイン画面（docs/design/ux.md §4.5）。
 *
 * 選択肢は「Google でログイン」と「ゲストのまま続ける」の 2 つだけ。
 * パスワードもパズルも課さない（AAA 3.3.9）。
 *
 * ゲストの制約（30 日で消える・編集できる共有リンクを作れない）は、
 * 選んだあとではなく**選ぶ前**に伝える。
 */
export const SignInScreen = ({
  actor,
  actions,
  isGoogleAvailable = true,
  onSignedIn,
  onSignedOut,
}: SignInScreenProps) => {
  const [message, setMessage] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const guideId = useId()

  const run = async (
    action: () => Promise<AuthActionResult>,
    onDone: (() => void) | undefined,
    success: string,
  ) => {
    setBusy(true)
    const result = await action()
    setBusy(false)
    if (result.ok) {
      setMessage(success)
      onDone?.()
      return
    }
    setMessage(describeAuthActionError(result.error))
  }

  const signInWithGoogle = () =>
    run(actions.signInWithGoogle, onSignedIn, 'Google のページへ移動します。')

  return (
    <>
      <h1>ログイン</h1>
      <p>
        共有リンクを開くだけで、ログインしなくても一緒に編集できます。
        ログインすると、自分が作った文書を別の端末からも開けます。
      </p>

      {actor.kind === 'user' ? (
        <div className="noter-auth-choices">
          <p>{actor.displayName} さんとしてログインしています。</p>
          <Button
            variant="secondary"
            busy={busy}
            onClick={() => void run(actions.signOut, onSignedOut, 'ログアウトしました。')}
          >
            ログアウト
          </Button>
        </div>
      ) : (
        <div className="noter-auth-choices">
          {actor.kind === 'guest' ? (
            <p>
              いまはゲストとして利用中です。この端末のデータは
              {formatDate(actor.sessionExpiresAt)} まで残ります。 Google
              でログインすると、文書はそのまま引き継がれます。
            </p>
          ) : undefined}
          {isGoogleAvailable ? (
            <Button busy={busy} onClick={() => void signInWithGoogle()}>
              Google でログイン
            </Button>
          ) : (
            <p>{GOOGLE_UNAVAILABLE}</p>
          )}
          {actor.kind === 'guest' ? (
            <Button
              variant="secondary"
              busy={busy}
              onClick={() => void run(actions.signOut, onSignedOut, 'ログアウトしました。')}
            >
              ログアウト
            </Button>
          ) : (
            <Button
              variant="secondary"
              busy={busy}
              onClick={() =>
                void run(actions.signInAsGuest, onSignedIn, 'ゲストとして使い始めました。')
              }
            >
              ゲストのまま続ける
            </Button>
          )}
        </div>
      )}

      <LiveRegion message={message} />

      <section aria-labelledby={guideId} className="noter-auth-guide">
        <h2 id={guideId}>ゲストのまま使うとき</h2>
        <ul>
          <li>
            この端末のデータは {GUEST_SESSION_DAYS} 日で消えます。使い続けると期限は延びます。
          </li>
          <li>
            共有リンクは「閲覧のみ」しか作れません。編集できるリンクは Google
            でログインすると作れます。
          </li>
          <li>
            別の端末で開くと別のゲストになります。Google でログインすると 1 つにまとまります。
          </li>
          <li>
            あとから Google でログインしても、ゲストのときに作った文書はそのまま引き継がれます。
          </li>
        </ul>
      </section>
    </>
  )
}
