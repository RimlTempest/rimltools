/**
 * 編集中の設定から、その場でコードのプレビューを作る。
 *
 * 生成は**ブラウザ側の wasm**で行い、サーバには投げない。設定を触るたびに
 * サーバへ問い合わせると Workers のリクエスト無料枠を使い切る
 * （docs/free-tier-budget.md / ADR-0003）。配線は `code-detail.route.tsx`。
 *
 * 生成画面（`@qrcc/generate/ui` の `GenerateScreen`）と重なるのは
 * 「デバウンスして作り直す」「問題だけを読み上げる」の 2 点だけで、
 * フォームの形も操作（生成画面には手動生成のボタンがある）も違う。
 * 共通の**知識**として既に公開されている `CodePreview` / `describeWarning` /
 * `describeRenderError` はそのまま使い、ここには残りの筋書きだけを書く。
 * 3 つ目のライブプレビューが出たら hook ごと `@qrcc/generate/ui` に上げる。
 */
import { useEffect, useRef, useState } from 'react'
import type { CodeId, Result } from '@qrcc/contract'
import { err, ok } from '@qrcc/contract'
import type { RenderRequest, RenderResponse } from '@qrcc/generate/contract'
import { describeRenderError } from '@qrcc/generate/contract'
import type { RenderFailure, RenderFn } from '@qrcc/generate/ui'
import { describeWarning } from '@qrcc/generate/ui'
import type { CodeFormError, CodeFormState } from '@qrcc/manage/core'
import { buildCodeDraft } from '@qrcc/manage/core'

/** 名前はコードの絵に影響しない。空でも絵は見せたいので、下書きにだけ仮の名前を入れる。 */
const PREVIEW_NAME = 'プレビュー'

/** 編集フォームの状態を、生成エンジンへの依頼に直す。 */
export const toPreviewRequest = (
  codeId: CodeId,
  form: CodeFormState,
): Result<RenderRequest, CodeFormError> => {
  const draft = buildCodeDraft(codeId, { ...form, name: PREVIEW_NAME })
  return draft.ok
    ? ok({
        payload: draft.value.payload,
        symbology: draft.value.symbology,
        style: draft.value.style,
        output: 'svg',
      })
    : err(draft.error)
}

/** 生成できなかった理由を、次にどうすればよいかが分かる文にする。 */
export const describePreviewFailure = (failure: RenderFailure): string =>
  failure.kind === 'unavailable'
    ? `プレビューを表示できませんでした（${failure.detail}）。保存と共有はこのまま続けられます。`
    : describeRenderError(failure)

type CodePreviewDeps = {
  readonly render: RenderFn
  readonly codeId: CodeId
  /** 読み込みが終わるまでは `undefined`。まだ作るものが決まっていない。 */
  readonly form: CodeFormState | undefined
  /** 手が止まってから作り直すまでの待ち時間（ms）。 */
  readonly debounceMs: number
  /**
   * 読み上げ領域に出す問題。**成功したことは伝えない。**
   * ライブ更新で成功のたびに読み上げると、画面がしゃべり続けて使えなくなる。
   */
  readonly onProblem: (problem: string | undefined) => void
}

export const useCodePreview = ({
  render,
  codeId,
  form,
  debounceMs,
  onProblem,
}: CodePreviewDeps): RenderResponse | undefined => {
  const [response, setResponse] = useState<RenderResponse | undefined>(undefined)
  /**
   * 直前に伝えた問題。**変わったときだけ**伝える。
   * 同じ警告を作り直すたびに読み上げないためと、進行中の生成が
   * 「保存しました」のような操作の返事を後から消さないため。
   */
  const announced = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (form === undefined) return undefined
    let cancelled = false

    const announce = (problem: string | undefined) => {
      if (problem === announced.current) return
      announced.current = problem
      onProblem(problem)
    }

    const update = async () => {
      const request = toPreviewRequest(codeId, form)
      if (!request.ok) {
        setResponse(undefined)
        announce(`${request.error.field}: ${request.error.reason}`)
        return
      }

      const outcome = await render(request.value)
      // 待っている間に設定が変わっていたら、古い結果で新しい表示を上書きしない
      if (cancelled) return

      if (!outcome.ok) {
        setResponse(undefined)
        announce(describePreviewFailure(outcome.error))
        return
      }
      // 警告は生成を止めない。コントラスト不足で拒否すると表現の自由を奪う
      setResponse(outcome.value)
      const warnings = outcome.value.warnings.map(describeWarning)
      announce(warnings.length === 0 ? undefined : warnings.join(' '))
    }

    // 入力のたびに走らせず、手が止まってから 1 回だけ作り直す
    const timer = setTimeout(() => void update(), debounceMs)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [render, codeId, form, debounceMs, onProblem])

  return response
}
