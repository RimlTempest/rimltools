import { useCallback, useEffect, useId, useState } from 'react'
import type { Result } from '@qrcc/contract'
import { parseHexColor, parseHttpUrl, parseNonEmptyText } from '@qrcc/contract'
import { buildEmailPayload } from '../core/payload/email.ts'
import { buildSmsPayload } from '../core/payload/sms.ts'
import { buildTelPayload } from '../core/payload/tel.ts'
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

/**
 * `live`  … ブラウザ側の wasm で生成する。無料枠を消費しないので設定を触るたびに更新する
 * `manual`… サーバに依頼する。毎回投げると無料枠を使い切るのでボタン操作にする
 */
export type GenerateMode = 'live' | 'manual'

type GenerateScreenProps = {
  readonly render: RenderFn
  readonly mode?: GenerateMode
  /** ライブ更新の待ち時間（ms）。テストでは 0 にする。 */
  readonly debounceMs?: number
  /**
   * この画面の最上位見出しのレベル。
   *
   * 単独のページなら 1。トップページのように**他の画面と並べて置く**ときは
   * 2 にして、ページの h1 を主題ひとつに保つ（AAA 2.4.10）。
   */
  readonly headingLevel?: 1 | 2
}

type FormState = {
  readonly payloadKind: PayloadKind
  readonly text: string
  readonly url: string
  readonly tel: string
  readonly emailTo: string
  readonly emailSubject: string
  readonly emailBody: string
  readonly smsNumber: string
  readonly smsBody: string
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
  tel: '',
  emailTo: '',
  emailSubject: '',
  emailBody: '',
  smsNumber: '',
  smsBody: '',
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

/**
 * ここは**網羅のまま残している**。内容の種類ごとに入力欄が違うので、
 * 種類を足した人に「フォームをどうするか」を必ず考えさせたい。
 * `default` を足さないこと。
 */
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
    case 'tel': {
      const tel = buildTelPayload(state.tel)
      return tel.ok
        ? tel
        : {
            ok: false,
            error: {
              field: '電話番号',
              reason: '国番号から始まる電話番号を入力してください（例: +819012345678）',
            },
          }
    }
    case 'email': {
      const email = buildEmailPayload({
        to: state.emailTo,
        subject: state.emailSubject,
        body: state.emailBody,
      })
      return email.ok
        ? email
        : {
            ok: false,
            error: {
              field: '宛先メールアドレス',
              reason: '正しいメールアドレスを入力してください',
            },
          }
    }
    case 'sms': {
      const sms = buildSmsPayload({ number: state.smsNumber, body: state.smsBody })
      return sms.ok
        ? sms
        : {
            ok: false,
            error: {
              field: '電話番号',
              reason: '国番号から始まる電話番号を入力してください（例: +819012345678）',
            },
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

/**
 * 符号の既定値はレジストリが持っている（`SYMBOLOGY_META[kind].defaults`）。
 * ここで二重に持たない。こうすると**符号を増やす作業がこの関数を
 * 触らずに済む**。QR だけは利用者が誤り訂正レベルを選ぶので上書きする。
 */
const buildSymbology = (state: FormState): Symbology =>
  state.symbologyKind === 'qr'
    ? { kind: 'qr', ec: state.qrEc }
    : SYMBOLOGY_META[state.symbologyKind].defaults

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
 * 実行場所によって挙動を変える（docs/free-tier-budget.md）:
 * ブラウザの wasm が使えるときは設定を触るたびに更新し、
 * サーバに頼るときはボタン操作にしてリクエストを浪費しない。
 *
 * 読み上げ領域には**問題だけ**を出す。成功のたびに読み上げると、
 * ライブ更新では常時しゃべり続けることになって使い物にならない。
 */
export const GenerateScreen = ({
  render,
  mode = 'manual',
  debounceMs = 300,
  headingLevel = 1,
}: GenerateScreenProps) => {
  // 見出しは常に 1 段ずつ。飛ばすと構造が読めなくなる（AAA 2.4.10）
  const Title = headingLevel === 2 ? 'h2' : 'h1'
  const Section = headingLevel === 2 ? 'h3' : 'h2'
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

  /** `announce` が false なら、成功しても読み上げ領域を触らない。 */
  const generate = useCallback(
    async (announce: boolean) => {
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
        if (warnings.length > 0) {
          setMessage(warnings.join(' '))
        } else if (announce) {
          setMessage(`${meta.label}を生成しました。`)
        } else {
          setMessage(undefined)
        }
        return
      }

      setResult(undefined)
      setMessage(
        outcome.error.kind === 'unavailable'
          ? `生成できませんでした（${outcome.error.detail}）。しばらく待ってからもう一度お試しください。`
          : describeRenderError(outcome.error),
      )
    },
    [state, render, meta.label],
  )

  useEffect(() => {
    if (mode !== 'live') return undefined
    // 入力のたびに走らせず、手が止まってから 1 回だけ生成する。
    // `generate` は設定が変わるたびに作り直されるので、待ち時間もそこで巻き戻る
    const timer = setTimeout(() => {
      void generate(false)
    }, debounceMs)
    return () => clearTimeout(timer)
  }, [mode, debounceMs, generate])

  return (
    <>
      <Title>コードを作る</Title>
      <p>
        内容と見た目を決めて生成します。生成した内容はコードの下にテキストでも表示されるので、
        画像を読み取れない場合でも確認できます。
      </p>

      {/*
       * プレビューは**フォームより前**に置く。設定は下に長く続くので、
       * 後ろに置くと変えるたびにフォームを越えてスクロールすることになる。
       * 広い画面では CSS が横に並べ替えて貼り付かせる（読み上げ順は変えない）。
       */}
      <div className="qrcc-generate__layout">
        <div className="qrcc-generate__preview">
          <Section>生成したコード</Section>
          {result === undefined ? (
            <p>
              {mode === 'manual'
                ? 'まだ生成していません。設定を決めて「生成する」を押してください。'
                : '設定を入力すると、ここにプレビューが出ます。'}
            </p>
          ) : (
            <CodePreview
              response={result}
              showDownloads={mode === 'live'}
              headingLevel={headingLevel === 2 ? 4 : 3}
            />
          )}
          <LiveRegion message={message} />
        </div>

        <form
          // 検証は自前の Result で行い、日本語の理由を読み上げ領域に出す。
          // ブラウザ既定の検証（type="email" など）に任せると、ローカライズされない
          // ポップアップが出て読み上げ領域に何も伝わらなくなる。
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void generate(true)
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
            {state.payloadKind === 'tel' ? (
              <Field
                label="電話番号（国番号付き）"
                type="tel"
                inputMode="tel"
                hint="国番号から始めてください（例: +819012345678）。"
                value={state.tel}
                onChange={(event) => update('tel', event.target.value)}
              />
            ) : undefined}
            {state.payloadKind === 'email' ? (
              <>
                <Field
                  label="宛先メールアドレス"
                  type="email"
                  inputMode="email"
                  value={state.emailTo}
                  onChange={(event) => update('emailTo', event.target.value)}
                />
                <Field
                  label="件名"
                  hint="空のままにもできます。"
                  value={state.emailSubject}
                  onChange={(event) => update('emailSubject', event.target.value)}
                />
                <Field
                  control="textarea"
                  label="本文"
                  hint="空のままにもできます。"
                  value={state.emailBody}
                  onChange={(event) => update('emailBody', event.target.value)}
                />
              </>
            ) : undefined}
            {state.payloadKind === 'sms' ? (
              <>
                <Field
                  label="送信先の電話番号（国番号付き）"
                  type="tel"
                  inputMode="tel"
                  hint="国番号から始めてください（例: +819012345678）。"
                  value={state.smsNumber}
                  onChange={(event) => update('smsNumber', event.target.value)}
                />
                <Field
                  control="textarea"
                  label="本文"
                  hint="空のままにもできます。"
                  value={state.smsBody}
                  onChange={(event) => update('smsBody', event.target.value)}
                />
              </>
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

          {mode === 'manual' ? (
            <Button type="submit" busy={busy}>
              {busy ? '生成しています…' : '生成する'}
            </Button>
          ) : (
            <p>設定を変えると、プレビューがその場で更新されます。</p>
          )}
        </form>
      </div>
    </>
  )
}
