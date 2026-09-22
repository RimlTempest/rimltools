import { useState } from 'react'
import { Button, LiveRegion, Window } from '@qrcc/ui'
import type { Actor } from '../contract/actor.ts'
import { GUEST_SESSION_DAYS } from './guest-guide.ts'
import type { AuthActionResult, AuthActions } from './auth-actions.ts'
import { describeAuthActionError } from './auth-actions.ts'

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

/**
 * サインイン画面。選択肢は「Google で続ける」と「ゲストで使う」の 2 つだけ。
 *
 * パスワードもパズルも課さない（AAA 3.3.9）。認知的な負担をかける認証を
 * 一切置かないことが、この画面の設計上の制約になっている。
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
      <h1>サインイン</h1>
      <p>
        コードの生成と読み取りは、サインインしなくても使えます。
        保存・一覧・共有を使うときだけサインインしてください。
      </p>
      <p>パスワードはありません。覚えることも、画像や文字を読み解くこともなく続けられます。</p>

      {actor.kind === 'visitor' ? (
        <div className="qrcc-auth-choices">
          {isGoogleAvailable ? (
            <Button busy={busy} onClick={() => void signInWithGoogle()}>
              Google で続ける
            </Button>
          ) : (
            <p>
              Google でのサインインはこの環境では使えません（設定されていません）。
              ゲストとして続けてください。
            </p>
          )}
          <Button
            variant="secondary"
            busy={busy}
            onClick={() =>
              void run(actions.signInAsGuest, onSignedIn, 'ゲストとして使い始めました。')
            }
          >
            登録せずに使う（ゲスト）
          </Button>
        </div>
      ) : (
        <div className="qrcc-auth-choices">
          <p>
            {actor.kind === 'guest'
              ? `ゲストとして利用中です。このデータは ${formatDate(actor.sessionExpiresAt)} まで残ります。`
              : `${actor.displayName} さんとしてサインインしています。`}
          </p>
          {actor.kind === 'guest' && isGoogleAvailable ? (
            <Button busy={busy} onClick={() => void signInWithGoogle()}>
              Google で続けてデータを引き継ぐ
            </Button>
          ) : undefined}
          <Button
            variant="secondary"
            busy={busy}
            onClick={() => void run(actions.signOut, onSignedOut, 'サインアウトしました。')}
          >
            サインアウト
          </Button>
        </div>
      )}

      <LiveRegion message={message} />

      {/* 注意書きなので帯は warning。何が起きるかを選ぶ前に読ませる */}
      <Window title="ゲストで使うときの注意" tone="warning">
        <div className="qrcc-auth-guide">
          <ul>
            <li>
              保存したコードは {GUEST_SESSION_DAYS} 日で消えます。使い続けると期限は延びます。
            </li>
            <li>編集できる共有リンクは作れません（閲覧用のリンクは作れます）。</li>
            <li>期限なしの共有リンクは作れません。共有リンクには必ず期限が付きます。</li>
            <li>あとから Google で続けると、ゲストのときに作ったコードをそのまま引き継げます。</li>
          </ul>
        </div>
      </Window>
    </>
  )
}
