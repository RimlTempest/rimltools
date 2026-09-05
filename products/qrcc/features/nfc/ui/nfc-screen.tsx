import type { FormEvent } from 'react'
import { useId, useReducer, useState } from 'react'
import { parseHttpUrl, parseNonEmptyText } from '@qrcc/contract'
import { Button, Field, LiveRegion } from '@qrcc/ui'
import type { NfcRecord } from '../contract/index.ts'
import type { WriteNfc } from './browser-nfc.ts'
import { INITIAL_NFC_STATE, reduceNfc } from './nfc-state.ts'

type NfcScreenProps = {
  /**
   * `undefined` は「この環境では書けない」。SSR とハイドレーション前、
   * および Web NFC の書き込み API が無いブラウザ（iOS・デスクトップなど）がこれにあたる。
   */
  readonly writeNfc: WriteNfc | undefined
}

type ParsedContent = { readonly record: NfcRecord } | { readonly error: string }

/**
 * 入力を URL かテキストかで自動的に振り分ける。
 * 種類を選ばせる項目を増やさず、1 つの入力欄で完結させるための判定。
 */
const parseContent = (raw: string): ParsedContent => {
  const url = parseHttpUrl(raw)
  if (url.ok) return { record: { kind: 'url', url: url.value } }
  const text = parseNonEmptyText(raw)
  if (text.ok) return { record: { kind: 'text', text: text.value } }
  return { error: '書き込む内容を入力してください。' }
}

const contentText = (record: NfcRecord): string =>
  record.kind === 'url' ? record.url : record.text

/**
 * NFC への書き込み画面。
 *
 * 書き込みは**端末の中だけ**で完結する。タグの内容をサーバに送ることはない。
 *
 * アクセシビリティ・安全性の要:
 * - 非対応の環境では、ボタンを出す前に「使えない理由」を伝える
 *   （Android の Chrome が必要で、iOS・デスクトップでは使えないこと）
 * - 書き込みは物理的で元に戻せない。**確認の画面を必ず挟み**、
 *   何を書くかを見せてから書き込む
 * - 進行状況（開始・成功・失敗）はすべて読み上げ領域に出す
 * - 失敗しても入力は失わず、確認画面からやり直せる
 */
export const NfcScreen = ({ writeNfc }: NfcScreenProps) => {
  const [state, dispatch] = useReducer(reduceNfc, INITIAL_NFC_STATE)
  const [input, setInput] = useState('')
  const [validationError, setValidationError] = useState<string | undefined>(undefined)
  const confirmHeadingId = useId()

  const submitContent = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const parsed = parseContent(input)
    if ('error' in parsed) {
      setValidationError(parsed.error)
      return
    }
    setValidationError(undefined)
    dispatch({ kind: 'confirm_requested', record: parsed.record })
  }

  const write = async () => {
    if (writeNfc === undefined || state.record === undefined) return
    dispatch({ kind: 'write_requested' })
    const outcome = await writeNfc(state.record)
    dispatch(
      outcome.ok ? { kind: 'write_succeeded' } : { kind: 'write_failed', failure: outcome.error },
    )
  }

  const startOver = () => {
    setInput('')
    setValidationError(undefined)
    dispatch({ kind: 'reset_requested' })
  }

  return (
    <>
      <h1>NFC タグに書く</h1>
      <p>
        URL やテキストを NFC タグに書き込みます。かざすだけで開けるようになり、
        印刷は要りません。書き込みはこの端末の中だけで行い、サーバへは送信しません。
      </p>

      {writeNfc === undefined ? (
        <p>
          この端末・ブラウザでは NFC への書き込みに対応していません。対応しているのは
          <strong>Android の Chrome だけ</strong>です。iOS やパソコンでは使えません。
        </p>
      ) : (
        <>
          <LiveRegion message={state.message} />

          {state.step === 'editing' ? (
            <form onSubmit={submitContent}>
              <Field
                label="書き込む内容"
                hint="URL を入力すると自動でリンクとして書き込まれます。それ以外はテキストとして書き込まれます。"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                {...(validationError === undefined ? {} : { error: validationError })}
              />
              <Button type="submit">内容を確認する</Button>
            </form>
          ) : undefined}

          {state.step === 'confirming' || state.step === 'writing' ? (
            <section aria-labelledby={confirmHeadingId} className="qrcc-nfc__confirm">
              <h2 id={confirmHeadingId}>書き込む内容を確認してください</h2>
              <p className="qrcc-nfc__preview">
                {state.record === undefined ? '' : contentText(state.record)}
              </p>
              <p>
                タグに近づけて書き込むと、タグに前から入っていた内容は上書きされます。
                <strong>この操作は元に戻せません。</strong>
              </p>
              <Button
                onClick={() => void write()}
                busy={state.step === 'writing'}
                disabled={state.step === 'writing'}
              >
                書き込む
              </Button>
              <Button
                variant="secondary"
                onClick={() => dispatch({ kind: 'edit_requested' })}
                disabled={state.step === 'writing'}
              >
                内容を変更する
              </Button>
            </section>
          ) : undefined}

          {state.step === 'done' ? (
            <section className="qrcc-nfc__done">
              <p>タグに書き込みました。続けて別のタグにも書き込めます。</p>
              <Button onClick={startOver}>続けて書き込む</Button>
            </section>
          ) : undefined}
        </>
      )}
    </>
  )
}
