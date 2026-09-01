import { useCallback, useEffect, useId, useState } from 'react'
import type { CodeId } from '@qrcc/contract'
import type { Actor, ShareExpiry, SharePermission } from '@qrcc/auth/contract'
import { canUse } from '@qrcc/auth/contract'
import { QR_ERROR_CORRECTION_META, SYMBOLOGY_KINDS, SYMBOLOGY_META } from '@qrcc/generate/contract'
import type { Folder, ShareLink } from '@qrcc/manage/contract'
import type { CodeFormState } from '@qrcc/manage/core'
import { buildCodeDraft, toCodeForm } from '@qrcc/manage/core'
import { describeManageFailure } from '@qrcc/manage/server'
import { CodePreview } from '@qrcc/generate/ui'
import type { RenderFn } from '@qrcc/generate/ui'
import { Button, Field, LiveRegion } from '@qrcc/ui'
import type { CodeLinkRenderer, ManageDeps } from './manage-deps.tsx'
import { defaultRenderLink } from './manage-deps.tsx'
import { SharePanel, describeShareDraftError } from './share-panel.tsx'
import { useCodePreview } from './use-code-preview.ts'

type CodeEditorScreenProps = {
  readonly actor: Actor
  readonly codeId: CodeId
  readonly deps: ManageDeps
  /** プレビューの作り方。ブラウザ側の wasm を配線する（サーバに投げない）。 */
  readonly renderPreview: RenderFn
  readonly renderLink?: CodeLinkRenderer
  /** ライブ更新の待ち時間（ms）。テストでは 0 にする。 */
  readonly previewDebounceMs?: number
}

const QR_LEVELS = ['L', 'M', 'Q', 'H'] as const

/**
 * 保存したコード 1 件の編集と共有。
 *
 * 保存は**全置換**なので、画面に出していない設定（静寂域や Wi-Fi の内容）も
 * `@qrcc/manage/core` の `toCodeForm` が持ち回る。
 * 「開いて保存しただけで設定が消える」を起こさないための分担。
 */
export const CodeEditorScreen = ({
  actor,
  codeId,
  deps,
  renderPreview,
  renderLink = defaultRenderLink,
  previewDebounceMs = 300,
}: CodeEditorScreenProps) => {
  const [form, setForm] = useState<CodeFormState | undefined>(undefined)
  const [shares, setShares] = useState<readonly ShareLink[]>([])
  const [folders, setFolders] = useState<readonly Folder[]>([])
  const [message, setMessage] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const contentGroup = useId()
  const ecGroup = useId()
  const folderId = useId()
  const symbologyId = useId()

  const { api } = deps
  const canManage = canUse(actor, 'save')

  // 設定を触るたびに、その場で作り直す（サーバには投げない）
  const preview = useCodePreview({
    render: renderPreview,
    codeId,
    form,
    debounceMs: previewDebounceMs,
    onProblem: setMessage,
  })

  /** 読み込みは「反映する関数」を返す。反映するかどうかは待っていた側が決める。 */
  const load = useCallback(async () => {
    const detail = await api.getCode(codeId)
    const folderList = await api.listFolders()
    return () => {
      if (!detail.ok) {
        setMessage(describeManageFailure(detail.error))
        return
      }
      setForm(toCodeForm(detail.value.code))
      setShares(detail.value.shares)
      if (folderList.ok) setFolders(folderList.value)
    }
  }, [api, codeId])

  useEffect(() => {
    if (!canManage) return undefined
    let cancelled = false
    const run = async () => {
      const apply = await load()
      if (!cancelled) apply()
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [canManage, load])

  if (!canManage) {
    return (
      <>
        <h1>コードを編集</h1>
        <p>
          保存したコードの編集にはサインインが必要です。
          生成と読み取りは、サインインしなくてもこれまでどおり使えます。
        </p>
        <p>{renderLink({ to: '/sign-in', label: 'サインインの方法を見る' })}</p>
      </>
    )
  }

  const save = async () => {
    if (form === undefined) return
    const draft = buildCodeDraft(codeId, form)
    if (!draft.ok) {
      setMessage(`${draft.error.field}: ${draft.error.reason}`)
      return
    }
    setBusy(true)
    const saved = await api.updateCode(draft.value)
    setBusy(false)
    setMessage(
      saved.ok ? `「${draft.value.name}」を保存しました。` : describeManageFailure(saved.error),
    )
  }

  const createShare = async (permission: SharePermission, expiry: ShareExpiry) => {
    const draft = deps.createShareDraft(actor, codeId, { permission, expiry })
    if (!draft.ok) {
      setMessage(describeShareDraftError(draft.error))
      return
    }
    setBusy(true)
    const created = await api.createShare(draft.value, deps.newIdempotencyKey())
    setBusy(false)
    if (!created.ok) {
      setMessage(describeManageFailure(created.error))
      return
    }
    setShares((current) => [created.value, ...current])
    setMessage('共有リンクを作りました。')
  }

  const revokeShare = async (share: ShareLink) => {
    setBusy(true)
    const revoked = await api.revokeShare(share.token)
    setBusy(false)
    if (!revoked.ok) {
      setMessage(describeManageFailure(revoked.error))
      return
    }
    setShares((current) => current.filter((existing) => existing.token !== share.token))
    setMessage('共有リンクを取り消しました。このリンクはもう使えません。')
  }

  const copyShare = async (url: string) => {
    const copied = await deps.copyText(url)
    setMessage(
      copied
        ? '共有リンクをコピーしました。'
        : 'コピーできませんでした。表示されている URL を選んでコピーしてください。',
    )
  }

  const update = <K extends keyof CodeFormState>(key: K, value: CodeFormState[K]) =>
    setForm((current) => (current === undefined ? current : { ...current, [key]: value }))

  return (
    <>
      <h1>コードを編集</h1>
      <p>{renderLink({ to: '/codes', label: '保存したコードの一覧に戻る' })}</p>

      <LiveRegion message={message} />

      {form === undefined ? (
        <p>コードを読み込んでいます。</p>
      ) : (
        <>
          <section aria-labelledby="qrcc-editor-basics">
            <h2 id="qrcc-editor-basics">内容と見た目</h2>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void save()
              }}
            >
              <Field
                label="名前"
                hint="一覧で探すときの手がかりになります。"
                value={form.name}
                onChange={(event) => update('name', event.target.value)}
              />

              <div className="qrcc-field">
                <label className="qrcc-field__label" htmlFor={folderId}>
                  保存先フォルダ
                </label>
                <select
                  id={folderId}
                  className="qrcc-field__control"
                  value={form.folderId ?? ''}
                  onChange={(event) =>
                    update(
                      'folderId',
                      folders.find((folder) => folder.id === event.target.value)?.id,
                    )
                  }
                >
                  <option value="">フォルダに入れない</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
              </div>

              {form.content.kind === 'other' ? (
                <p>
                  この内容（Wi-Fi 設定など）はこの画面では編集できません。
                  保存してもそのまま残ります。内容を変えるときは、生成画面で作り直してください。
                </p>
              ) : (
                <fieldset>
                  <legend>内容の種類</legend>
                  <label>
                    <input
                      type="radio"
                      name={contentGroup}
                      checked={form.content.kind === 'url'}
                      onChange={() => update('content', { kind: 'url', url: '' })}
                    />
                    URL
                  </label>
                  <label>
                    <input
                      type="radio"
                      name={contentGroup}
                      checked={form.content.kind === 'text'}
                      onChange={() => update('content', { kind: 'text', text: '' })}
                    />
                    テキスト
                  </label>
                </fieldset>
              )}

              {form.content.kind === 'url' ? (
                <Field
                  label="リンク先の URL"
                  type="url"
                  inputMode="url"
                  hint="http:// または https:// から始めてください。"
                  value={form.content.url}
                  onChange={(event) => update('content', { kind: 'url', url: event.target.value })}
                />
              ) : undefined}
              {form.content.kind === 'text' ? (
                <Field
                  control="textarea"
                  label="内容"
                  hint="読み取ったときにそのまま表示される文字列です。"
                  value={form.content.text}
                  onChange={(event) =>
                    update('content', { kind: 'text', text: event.target.value })
                  }
                />
              ) : undefined}

              <div className="qrcc-field">
                <label className="qrcc-field__label" htmlFor={symbologyId}>
                  コードの種類
                </label>
                <select
                  id={symbologyId}
                  className="qrcc-field__control"
                  value={form.symbologyKind}
                  onChange={(event) =>
                    update(
                      'symbologyKind',
                      SYMBOLOGY_KINDS.find((kind) => kind === event.target.value)
                        ?? form.symbologyKind,
                    )
                  }
                >
                  {SYMBOLOGY_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {SYMBOLOGY_META[kind].label}
                    </option>
                  ))}
                </select>
              </div>

              {form.symbologyKind === 'qr' ? (
                <fieldset>
                  <legend>誤り訂正レベル</legend>
                  <p>強いほど汚れや欠けに強くなりますが、コードは大きくなります。</p>
                  {QR_LEVELS.map((level) => (
                    <label key={level}>
                      <input
                        type="radio"
                        name={ecGroup}
                        checked={form.qrEc === level}
                        onChange={() => update('qrEc', level)}
                      />
                      {QR_ERROR_CORRECTION_META[level].label}（
                      {QR_ERROR_CORRECTION_META[level].recovery}）
                    </label>
                  ))}
                </fieldset>
              ) : undefined}

              <Field
                label="前景色"
                type="color"
                hint="コード本体の色です。背景とのコントラストが低いと読み取りにくくなります。"
                value={form.foreground}
                onChange={(event) => update('foreground', event.target.value)}
              />
              <Field
                label="背景色"
                type="color"
                value={form.background}
                onChange={(event) => update('background', event.target.value)}
              />
              <Field
                label="1 モジュールの大きさ"
                type="number"
                min={1}
                max={40}
                hint="単位はピクセルです。印刷用途では大きめにしてください。"
                value={form.scale}
                onChange={(event) => update('scale', Number(event.target.value))}
              />

              <p>設定を変えると、下のプレビューがすぐ更新されます。</p>
              <Button type="submit" busy={busy}>
                保存する
              </Button>
            </form>
          </section>

          <section aria-labelledby="qrcc-editor-preview">
            <h2 id="qrcc-editor-preview">プレビュー</h2>
            {preview === undefined ? (
              <p>設定を読み込むと、ここにコードのプレビューが出ます。</p>
            ) : (
              /* 保存はこの画面の仕事。書き出しはトップの生成画面に任せる */
              <CodePreview response={preview} showDownloads={false} />
            )}
          </section>

          <SharePanel
            actor={actor}
            shares={shares}
            origin={deps.origin}
            busy={busy}
            onCreate={(permission, expiry) => void createShare(permission, expiry)}
            onRevoke={(share) => void revokeShare(share)}
            onCopy={(url) => void copyShare(url)}
          />
        </>
      )}
    </>
  )
}
