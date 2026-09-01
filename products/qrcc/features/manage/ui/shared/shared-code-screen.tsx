/**
 * 共有リンク（`/shared/<token>`）で開く画面。
 *
 * **サインインは要らない。** リンクを受け取った人は qrcc のアカウントを
 * 持っていないので、この画面だけで用が足りるようにする（ADR-0004）。
 *
 * 絵はブラウザの wasm で描く。サーバに画像生成を投げないので、
 * リンクが何人に配られても Workers のリクエストを消費しない
 * （docs/free-tier-budget.md）。
 *
 * 権限が `edit` でも**この画面では編集させない**。編集は所有者の認証を通る
 * `/codes/<id>` の役目で、ここでその判定をやり直すと認可が二重になる。
 */
import { useEffect, useId, useState } from 'react'
import type { Result, ShareToken } from '@qrcc/contract'
import type { Actor } from '@qrcc/auth/contract'
import { isSignedIn } from '@qrcc/auth/contract'
import type { RenderResponse } from '@qrcc/generate/contract'
import { describeRenderError } from '@qrcc/generate/contract'
import type { RenderFailure, RenderFn } from '@qrcc/generate/ui'
import { CodePreview } from '@qrcc/generate/ui'
import type { SharePreview } from '@qrcc/manage/contract'
import type { ManageFailure } from '@qrcc/manage/server'
import { codePath } from '../format.ts'
import type { CodeLinkRenderer } from '../manage-deps.tsx'
import { defaultRenderLink } from '../manage-deps.tsx'
import type { SharedFailure } from './share-view.ts'
import {
  describeSharePermission,
  describeSharedFailure,
  readShareToken,
  toRenderRequest,
  toSharedFailure,
} from './share-view.ts'

/**
 * この画面が要るものだけ（ISP）。
 * 共有された人は保存も削除もしないので、`ManageApi` 全部は受け取らない。
 */
export type SharedCodeDeps = {
  readonly resolveShare: (token: ShareToken) => Promise<Result<SharePreview, ManageFailure>>
  readonly render: RenderFn
}

type SharedCodeScreenProps = {
  /** URL から来た未検証の文字列。形の検証はこの画面が行う。 */
  readonly token: string
  readonly actor: Actor
  readonly deps: SharedCodeDeps
  readonly renderLink?: CodeLinkRenderer
}

/** 絵が出せたかどうか。出せなくても、名前と理由は読めるようにする。 */
type Drawn =
  | { readonly kind: 'drawn'; readonly response: RenderResponse }
  | { readonly kind: 'not_drawn'; readonly reason: string }

type ScreenState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly failure: SharedFailure }
  | { readonly kind: 'ready'; readonly preview: SharePreview; readonly drawn: Drawn }

const describeRenderFailure = (failure: RenderFailure): string =>
  failure.kind === 'unavailable'
    ? `コードの絵を描けませんでした（${failure.detail}）。読み込み直すと出ることがあります。`
    : describeRenderError(failure)

export const SharedCodeScreen = ({
  token,
  actor,
  deps,
  renderLink = defaultRenderLink,
}: SharedCodeScreenProps) => {
  const [state, setState] = useState<ScreenState>({ kind: 'loading' })
  const codeHeadingId = useId()
  const permissionHeadingId = useId()

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      const parsed = readShareToken(token)
      if (!parsed.ok) {
        if (!cancelled) setState({ kind: 'failed', failure: parsed.error })
        return
      }

      const resolved = await deps.resolveShare(parsed.value)
      if (cancelled) return
      if (!resolved.ok) {
        setState({ kind: 'failed', failure: toSharedFailure(resolved.error) })
        return
      }

      const drawn = await deps.render(toRenderRequest(resolved.value.code))
      if (cancelled) return
      setState({
        kind: 'ready',
        preview: resolved.value,
        drawn: drawn.ok
          ? { kind: 'drawn', response: drawn.value }
          : { kind: 'not_drawn', reason: describeRenderFailure(drawn.error) },
      })
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [token, deps])

  const makeYourOwn = <p>{renderLink({ to: '/generate', label: '自分でコードを作る' })}</p>

  if (state.kind === 'loading') {
    return (
      <>
        <h1>共有されたコード</h1>
        <p>リンクの中身を確かめています。しばらくお待ちください。</p>
      </>
    )
  }

  if (state.kind === 'failed') {
    // 見出しだけで何が起きたか分かり、本文で次にすることまで書く
    const guidance = describeSharedFailure(state.failure)
    return (
      <>
        <h1>{guidance.heading}</h1>
        <p>{guidance.reason}</p>
        <p>{guidance.nextStep}</p>
        {makeYourOwn}
      </>
    )
  }

  const { code } = state.preview

  return (
    <>
      <h1>{code.name}</h1>
      <p>共有リンクから開いています。サインインしなくても、このコードは見られます。</p>

      <section aria-labelledby={codeHeadingId}>
        <h2 id={codeHeadingId}>共有されたコード</h2>
        {state.drawn.kind === 'drawn' ? (
          <CodePreview response={state.drawn.response} />
        ) : (
          <p>{state.drawn.reason}</p>
        )}
      </section>

      <section aria-labelledby={permissionHeadingId}>
        <h2 id={permissionHeadingId}>このリンクでできること</h2>
        <p>{describeSharePermission(state.preview.permission)}</p>
        {state.preview.permission === 'edit' && isSignedIn(actor) ? (
          <p>{renderLink({ to: codePath(code.id), label: `「${code.name}」の編集画面を開く` })}</p>
        ) : undefined}
        {state.preview.permission === 'edit' && !isSignedIn(actor) ? (
          <>
            <p>内容を変えるには、このコードを保存できるアカウントでのサインインが要ります。</p>
            <p>{renderLink({ to: '/sign-in', label: 'サインインの方法を見る' })}</p>
          </>
        ) : undefined}
      </section>

      {makeYourOwn}
    </>
  )
}
