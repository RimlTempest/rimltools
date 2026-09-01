import { useId, useState } from 'react'
import type { Result } from '@qrcc/contract'
import { parseHexColor, parseHttpUrl, parseNonEmptyText } from '@qrcc/contract'
import { Button, Field, LiveRegion } from '@qrcc/ui'
import type {
  CodePayload,
  ModuleShape,
  PayloadKind,
  QrErrorCorrection,
  RenderError,
  RenderRequest,
  RenderResponse,
  Symbology,
  SymbologyKind,
} from '../contract/index.ts'
import {
  MODULE_SHAPE_META,
  PAYLOAD_KINDS,
  PAYLOAD_META,
  QR_ERROR_CORRECTION_META,
  SYMBOLOGY_KINDS,
  SYMBOLOGY_META,
  describeRenderError,
  isPayloadCompatible,
} from '../contract/index.ts'
import { CodePreview } from './code-preview.tsx'
import { describeWarning } from './describe-warning.ts'

export type RenderFailure = RenderError | { readonly kind: 'unavailable'; readonly detail: string }

/** 生成の実行方法。依存として受け取るのでテストではその場で答えを返せる。 */
export type RenderFn = (request: RenderRequest) => Promise<Result<RenderResponse, RenderFailure>>

type GenerateScreenProps = {
  readonly render: RenderFn
}

type FormState = {
  readonly payloadKind: PayloadKind
  readonly text: string
  readonly url: string
  readonly ssid: string
  readonly password: string
  readonly hidden: boolean
  readonly symbologyKind: SymbologyKind
  readonly qrEc: QrErrorCorrection
  readonly foreground: string
  readonly background: string
  readonly scale: number
  readonly moduleShape: ModuleShape
}

const INITIAL: FormState = {
  payloadKind: 'url',
  text: '',
  url: 'https://qrcc.riml4i.com',
  ssid: '',
  password: '',
  hidden: false,
  symbologyKind: 'qr',
  qrEc: 'M',
  foreground: '#000000',
  background: '#ffffff',
  scale: 6,
  moduleShape: 'square',
}

type BuildError = { readonly field: string; readonly reason: string }

const buildPayload = (state: FormState): Result<CodePayload, BuildError> => {
  switch (state.payloadKind) {
    case 'text':
      return state.text.length === 0
        ? { ok: false, error: { field: '内容', reason: '文字を入力してください' } }
        : { ok: true, value: { kind: 'text', text: state.text } }
    case 'url': {
      const url = parseHttpUrl(state.url)
      return url.ok
        ? { ok: true, value: { kind: 'url', url: url.value } }
        : {
            ok: false,
            error: { field: 'URL', reason: 'http:// か https:// で始まる URL を入力してください' },
          }
    }
    case 'wifi': {
      const ssid = parseNonEmptyText(state.ssid)
      return ssid.ok
        ? {
            ok: true,
            value: {
              kind: 'wifi',
              ssid: ssid.value,
              auth:
                state.password.length === 0
                  ? { kind: 'nopass' }
                  : { kind: 'wpa', password: state.password },
              hidden: state.hidden,
            },
          }
        : {
            ok: false,
            error: { field: 'ネットワーク名', reason: 'ネットワーク名を入力してください' },
          }
    }
  }
}

const buildSymbology = (state: FormState): Symbology => {
  switch (state.symbologyKind) {
    case 'qr':
      return { kind: 'qr', ec: state.qrEc }
    case 'code128':
      return { kind: 'code128', charset: 'auto' }
    case 'ean13':
      return { kind: 'ean13' }
  }
}

const buildRequest = (state: FormState): Result<RenderRequest, BuildError> => {
  const payload = buildPayload(state)
  if (!payload.ok) return payload
  const foreground = parseHexColor(state.foreground)
  const background = parseHexColor(state.background)
  if (!foreground.ok || !background.ok) {
    return { ok: false, error: { field: '色', reason: '色の指定が不正です' } }
  }
  return {
    ok: true,
    value: {
      payload: payload.value,
      symbology: buildSymbology(state),
      style: {
        foreground: foreground.value,
        background: { kind: 'solid', color: background.value },
        scale: state.scale,
        quiet_zone: null,
        module_shape: state.moduleShape,
        bar_height: 40,
        human_readable: true,
      },
      output: 'svg',
    },
  }
}

/**
 * 生成画面。
 *
 * 生成はボタン操作で実行する。設定を触るたびにサーバへ投げると
 * 無料枠のリクエストを使い切ってしまうため（docs/free-tier-budget.md）。
 * ブラウザ側 wasm が入ったら（feat/wasm-bridge）即時プレビューに変える。
 */
export const GenerateScreen = ({ render }: GenerateScreenProps) => {
  const [state, setState] = useState<FormState>(INITIAL)
  const [result, setResult] = useState<RenderResponse | undefined>(undefined)
  const [message, setMessage] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const payloadGroup = useId()
  const symbologyGroup = useId()

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setState((current) => ({ ...current, [key]: value }))

  const meta = SYMBOLOGY_META[state.symbologyKind]
  const compatible = isPayloadCompatible(state.payloadKind, state.symbologyKind)

  const submit = async () => {
    const request = buildRequest(state)
    if (!request.ok) {
      setResult(undefined)
      setMessage(`${request.error.field}: ${request.error.reason}`)
      return
    }
    setBusy(true)
    const outcome = await render(request.value)
    setBusy(false)
    if (outcome.ok) {
      setResult(outcome.value)
      const warnings = outcome.value.warnings.map(describeWarning)
      setMessage(
        warnings.length === 0
          ? `${meta.label}を生成しました。`
          : `${meta.label}を生成しました。${warnings.join(' ')}`,
      )
      return
    }
    setResult(undefined)
    setMessage(
      outcome.error.kind === 'unavailable'
        ? `生成できませんでした（${outcome.error.detail}）。しばらく待ってからもう一度お試しください。`
        : describeRenderError(outcome.error),
    )
  }

  return (
    <>
      <h1>コードを作る</h1>
      <p>
        内容と見た目を決めて生成します。生成した内容はコードの下にテキストでも表示されるので、
        画像を読み取れない場合でも確認できます。
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <fieldset>
          <legend>入れる内容</legend>
          <div role="radiogroup" aria-label="内容の種類">
            {PAYLOAD_KINDS.map((kind) => (
              <label key={kind}>
                <input
                  type="radio"
                  name={payloadGroup}
                  value={kind}
                  checked={state.payloadKind === kind}
                  onChange={() => update('payloadKind', kind)}
                />
                {PAYLOAD_META[kind].label}
              </label>
            ))}
          </div>
          <p>{PAYLOAD_META[state.payloadKind].description}</p>

          {state.payloadKind === 'text' ? (
            <Field
              control="textarea"
              label="内容"
              hint="読み取ったときにそのまま表示される文字列です。"
              value={state.text}
              onChange={(event) => update('text', event.target.value)}
            />
          ) : undefined}
          {state.payloadKind === 'url' ? (
            <Field
              label="リンク先の URL"
              type="url"
              inputMode="url"
              hint="http:// または https:// から始めてください。"
              placeholder={SYMBOLOGY_META.qr.example}
              value={state.url}
              onChange={(event) => update('url', event.target.value)}
            />
          ) : undefined}
          {state.payloadKind === 'wifi' ? (
            <>
              <Field
                label="ネットワーク名"
                hint="Wi-Fi の SSID です。"
                value={state.ssid}
                onChange={(event) => update('ssid', event.target.value)}
              />
              <Field
                label="パスワード"
                type="password"
                hint="空のままにすると、パスワードなしのネットワークとして扱います。"
                value={state.password}
                onChange={(event) => update('password', event.target.value)}
              />
              <label>
                <input
                  type="checkbox"
                  checked={state.hidden}
                  onChange={(event) => update('hidden', event.target.checked)}
                />
                ステルス（SSID を公開していない）ネットワーク
              </label>
            </>
          ) : undefined}
        </fieldset>

        <fieldset>
          <legend>コードの種類</legend>
          <div role="radiogroup" aria-label="コードの種類">
            {SYMBOLOGY_KINDS.map((kind) => (
              <label key={kind}>
                <input
                  type="radio"
                  name={symbologyGroup}
                  value={kind}
                  checked={state.symbologyKind === kind}
                  onChange={() => update('symbologyKind', kind)}
                />
                {SYMBOLOGY_META[kind].label}
              </label>
            ))}
          </div>
          <p>{meta.description}</p>
          {compatible ? undefined : (
            <p role="alert">
              {PAYLOAD_META[state.payloadKind].label}は{meta.label}
              で表せません。内容かコードの種類を変えてください。
            </p>
          )}

          {state.symbologyKind === 'qr' ? (
            <fieldset>
              <legend>誤り訂正レベル</legend>
              <p>強いほど汚れや欠けに強くなりますが、コードは大きくなります。</p>
              {(['L', 'M', 'Q', 'H'] as const).map((level) => (
                <label key={level}>
                  <input
                    type="radio"
                    name={`${symbologyGroup}-ec`}
                    value={level}
                    checked={state.qrEc === level}
                    onChange={() => update('qrEc', level)}
                  />
                  {QR_ERROR_CORRECTION_META[level].label}（
                  {QR_ERROR_CORRECTION_META[level].recovery}）
                </label>
              ))}
            </fieldset>
          ) : undefined}
        </fieldset>

        <fieldset>
          <legend>見た目</legend>
          <Field
            label="前景色"
            type="color"
            hint="コード本体の色です。背景とのコントラストが低いと読み取りにくくなります。"
            value={state.foreground}
            onChange={(event) => update('foreground', event.target.value)}
          />
          <Field
            label="背景色"
            type="color"
            value={state.background}
            onChange={(event) => update('background', event.target.value)}
          />
          <Field
            label="1 モジュールの大きさ"
            type="number"
            min={1}
            max={40}
            hint="単位はピクセルです。印刷用途では大きめにしてください。"
            value={state.scale}
            onChange={(event) => update('scale', Number(event.target.value))}
          />
          {meta.oneDimensional ? undefined : (
            <fieldset>
              <legend>モジュールの形</legend>
              {(['square', 'dot', 'rounded'] as const).map((shape) => (
                <label key={shape}>
                  <input
                    type="radio"
                    name={`${symbologyGroup}-shape`}
                    value={shape}
                    checked={state.moduleShape === shape}
                    onChange={() => update('moduleShape', shape)}
                  />
                  {MODULE_SHAPE_META[shape].label}
                </label>
              ))}
            </fieldset>
          )}
        </fieldset>

        <Button type="submit" busy={busy}>
          {busy ? '生成しています…' : '生成する'}
        </Button>
      </form>

      <LiveRegion message={message} />

      <h2>生成したコード</h2>
      {result === undefined ? (
        <p>まだ生成していません。設定を決めて「生成する」を押してください。</p>
      ) : (
        <CodePreview response={result} />
      )}
    </>
  )
}
