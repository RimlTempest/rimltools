import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Role } from '@noter/contract'
import type { DocumentHeader } from '@noter/documents/contract'
import { can } from '@noter/documents/core'
import type { NavItem, NavLinkRenderer } from '@noter/shell/ui'
import { Breadcrumbs } from '@noter/shell/ui'
import type { DataDocumentKind } from '@noter/formats/contract'
import type { ConnectionState } from '@noter/sync/contract'
import { LiveRegion } from '@noter/ui'
import type { Awareness } from 'y-protocols/awareness'
import type * as Y from 'yjs'
import type { DocumentActions } from '../contract/actions.ts'
import type { ConvertOutcome } from '../contract/convert-outcome.ts'
import type { EditorDiagnostic } from '../contract/diagnostic.ts'
import type { FormatOutcome } from '../contract/format-outcome.ts'
import type { Peer } from '../contract/peer.ts'
import type { SaveState } from '../contract/save-state.ts'
import type { ViewMode } from '../contract/view-mode.ts'
import { formatMessage } from '../core/format-message.ts'
import { joinedMessage, leftMessage } from '../core/presence.ts'
import { statusText } from '../core/status-text.ts'
import { nextViewMode } from '../core/view-mode.ts'
import type { EditorHandle } from './code-editor.tsx'
import { CodeEditor } from './code-editor.tsx'
import { EditorHeader } from './editor-header.tsx'
import type { ImportPlacement } from './editor-toolbar.tsx'
import { EXPORT_ANCHOR_ID, EditorToolbar } from './editor-toolbar.tsx'
import { LimitBanner, limitReasonOf } from './limit-banner.tsx'
import { useAnnouncer } from './use-announcer.ts'

type EditorScreenProps = {
  readonly document: DocumentHeader
  /** この人の権限。`role` にすると JSX の ARIA ロールと紛らわしいので名前を変えてある。 */
  readonly actorRole: Role
  /** 閲覧のみの人に「誰が共有したか」を伝える。 */
  readonly ownerName: string
  readonly connection: ConnectionState
  readonly save: SaveState
  readonly peers: readonly Peer[]
  readonly ytext: Y.Text
  /** 接続が開くまでは `undefined`。エディタはそれまで出さない。 */
  readonly awareness: Awareness | undefined
  readonly undoManager: Y.UndoManager
  readonly actions: DocumentActions
  readonly rawUrl: string
  readonly copyText: (text: string) => Promise<boolean>
  readonly download: (text: string) => void
  readonly initialViewMode: ViewMode
  readonly onViewModeChange?: (mode: ViewMode) => void
  readonly renderLink?: NavLinkRenderer
  /** owner にだけ渡す。共有ダイアログを開く。 */
  readonly onShare?: () => void
  readonly onChanged?: () => void
  readonly onLeft?: () => void
  readonly shareDialog?: ReactNode
  readonly namePrompt?: ReactNode
  /** plan 006 が差し込む。未指定なら「準備中」を出す。 */
  readonly preview?: ReactNode
  /** plan 006 が差し込む。未指定なら問題パネルを出さない。 */
  readonly diagnostics?: readonly EditorDiagnostic[]
  /**
   * 整形。整形そのものは配線側（`@noter/formats`）が行い、結果だけを返す。
   * 本文の差し替えと読み上げはこの画面が引き受ける。
   * 未指定なら整形ボタンを出さない（markdown には「正しい形」が無い）。
   */
  readonly formatAction?: () => FormatOutcome
  /**
   * 「変換して新規作成」。変換・作成・遷移は配線側が行い、この画面は
   * 結果を読み上げるだけ。未指定なら変換の出口を出さない。
   */
  readonly convertAction?: (to: DataDocumentKind) => Promise<ConvertOutcome>
  /**
   * 編集の提案パネル（`ProposalPanel`）。配線側が組み立てて差し込む。
   * 未指定なら何も出さない。
   */
  readonly proposal?: ReactNode
  /**
   * 本文の差し替え口を配線側へ渡す（`CodeEditor` の `onReady` と同じ形。
   * 壊されるときは `undefined` で呼ぶ）。
   *
   * 提案の適用は **CodeMirror のトランザクション**として当てなければ
   * ならず、その取っ手を持っているのはこの画面だけ。提案パネルが
   * `Y.Text` に直接触らずに済むよう、当てる関数の方を配線側へ渡す。
   */
  readonly onApplyReady?: (applyText: ((text: string) => void) | undefined) => void
}

/**
 * エディタ画面（docs/design/ux.md §4.2）。
 *
 * 状態も接続も持たない。`Y.Text` と接続状態を受け取って並べるだけなので、
 * 配線（`editor.route.tsx`）を差し替えれば別の文脈でも使える。
 *
 * 読み上げ領域はこの画面に**ただ 1 つ**（`docs/accessibility.md` §2 の 4.1.3）。
 * 接続状態・参加者の増減・操作の結果はすべてここへ集める。
 */
export const EditorScreen = ({
  document,
  actorRole,
  ownerName,
  connection,
  save,
  peers,
  ytext,
  awareness,
  undoManager,
  actions,
  rawUrl,
  copyText,
  download,
  initialViewMode,
  onViewModeChange,
  renderLink,
  onShare,
  onChanged,
  onLeft,
  shareDialog,
  namePrompt,
  preview,
  diagnostics,
  formatAction,
  convertAction,
  proposal,
  onApplyReady,
}: EditorScreenProps) => {
  const announcer = useAnnouncer()
  const announce = announcer.announce
  const [mode, setMode] = useState<ViewMode>(initialViewMode)
  const [problemsOpen, setProblemsOpen] = useState(false)
  const handleRef = useRef<EditorHandle | undefined>(undefined)
  const knownPeers = useRef<readonly Peer[]>([])

  const canEdit = can(actorRole, 'edit')
  const canFormat = canEdit && formatAction !== undefined
  const hasProblems = diagnostics !== undefined
  const status = statusText(connection, save)
  // 上限に達しても入力は続けられる。書き出しだけ促す（ux.md §6.5）
  const limitReason = limitReasonOf(connection)

  const trail: readonly NavItem[] = useMemo(
    () => [
      { to: '/', label: '文書一覧' },
      { to: `/d/${document.id}`, label: document.title },
    ],
    [document.id, document.title],
  )

  useEffect(() => {
    announce(status.announce)
  }, [status.announce, announce])

  useEffect(() => {
    // 出入りは 1 回だけ告げる。カーソルの移動は告げない（読み上げが止まらなくなる）
    announce(joinedMessage(knownPeers.current, peers) ?? leftMessage(knownPeers.current, peers))
    knownPeers.current = peers
  }, [peers, announce])

  const changeMode = useCallback(
    (next: ViewMode): void => {
      setMode(next)
      onViewModeChange?.(next)
    },
    [onViewModeChange],
  )

  /**
   * 整形は **CodeMirror のトランザクションとして**当てる（`replaceAll`）。
   * `ytext` を直接書き換えると、その変更が y-codemirror.next の
   * `ySyncAnnotation` を通らず、undo の履歴と選択範囲の追従が普段の編集と
   * 食い違う。取り込み（import）と同じ道を通す。
   */
  const runFormat = useCallback((): void => {
    if (formatAction === undefined) return
    const outcome = formatAction()
    if (outcome.kind === 'formatted') handleRef.current?.replaceAll(outcome.text)
    if (outcome.kind === 'failed') setProblemsOpen(true)
    announce(formatMessage(outcome.kind))
  }, [formatAction, announce])

  /** 提案の適用。整形と同じく、必ず CodeMirror のトランザクションを通す。 */
  const applyText = useCallback(
    (text: string): void => {
      handleRef.current?.replaceAll(text)
      announce('提案を本文に取り込みました。')
    },
    [announce],
  )

  // ショートカット（ux.md §7）。CodeMirror の中で押しても効くよう window で拾う
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key === '\\') {
        event.preventDefault()
        setMode((current) => {
          const next = nextViewMode(current)
          onViewModeChange?.(next)
          return next
        })
        return
      }
      // Shift を押していると event.key は大文字になる（'P'）
      if (!event.shiftKey) return
      const key = event.key.toLowerCase()
      if (key === 'p' && hasProblems) {
        event.preventDefault()
        setProblemsOpen((open) => !open)
        return
      }
      if (key === 'f' && canFormat) {
        event.preventDefault()
        runFormat()
      }
    }
    globalThis.addEventListener('keydown', onKeyDown)
    return () => globalThis.removeEventListener('keydown', onKeyDown)
  }, [onViewModeChange, hasProblems, canFormat, runFormat])

  const copy = async (text: string, success: string): Promise<void> => {
    announce(
      (await copyText(text))
        ? success
        : 'コピーできませんでした。本文を選んで手動でコピーしてください。',
    )
  }

  const runConvert = (to: DataDocumentKind): void => {
    if (convertAction === undefined) return
    const convert = async (): Promise<void> => {
      const outcome = await convertAction(to)
      if (outcome.kind === 'created') {
        announce('変換した文書を作りました。')
        return
      }
      // 直す場所があるときだけ問題パネルを開く（表せない値は開いても何も無い）
      if ((diagnostics?.length ?? 0) > 0) setProblemsOpen(true)
      announce(outcome.message)
    }
    void convert()
  }

  const importText = (text: string, placement: ImportPlacement): void => {
    const handle = handleRef.current
    if (handle === undefined) return
    if (placement === 'replace') handle.replaceAll(text)
    else handle.insertAtCursor(text)
    announce('取り込みました。')
  }

  return (
    <>
      <Breadcrumbs trail={trail} {...(renderLink === undefined ? {} : { renderLink })} />

      <EditorHeader
        document={document}
        actorRole={actorRole}
        status={status}
        peers={peers}
        actions={actions}
        onAnnounce={announce}
        {...(onShare === undefined ? {} : { onShare })}
        {...(onChanged === undefined ? {} : { onChanged })}
        {...(onLeft === undefined ? {} : { onLeft })}
      />

      {limitReason === undefined ? undefined : (
        <LimitBanner
          reason={limitReason}
          documentId={document.id}
          exportTargetId={EXPORT_ANCHOR_ID}
        />
      )}

      <EditorToolbar
        mode={mode}
        onModeChange={changeMode}
        kind={document.kind}
        {...(canEdit ? { onImport: importText } : {})}
        onDownload={() => download(ytext.toJSON())}
        onCopyText={() => void copy(ytext.toJSON(), '本文をコピーしました。')}
        onCopyRawUrl={() => void copy(rawUrl, 'raw の URL をコピーしました。')}
        rawUrl={rawUrl}
        onNotice={announce}
        {...(canFormat ? { formatAction: runFormat } : {})}
        {...(canEdit && convertAction !== undefined ? { onConvert: runConvert } : {})}
        {...(diagnostics === undefined
          ? {}
          : {
              problems: {
                count: diagnostics.length,
                expanded: problemsOpen,
                onToggle: () => setProblemsOpen((open) => !open),
              },
            })}
      />

      <div className="noter-workspace" data-view={mode}>
        <section className="noter-pane" data-pane="editor" aria-label="エディタ">
          {canEdit ? undefined : (
            <p className="noter-editor__notice">{`閲覧のみです（${ownerName}が共有）`}</p>
          )}
          <p className="noter-editor__hint">
            本文の中では Tab がインデントになりません。Tab キーでそのまま次の項目へ移れます。
          </p>
          {awareness === undefined ? (
            <p className="noter-editor__waiting">エディタを準備しています。</p>
          ) : (
            <CodeEditor
              ytext={ytext}
              awareness={awareness}
              undoManager={undoManager}
              kind={document.kind}
              readOnly={!canEdit}
              {...(diagnostics === undefined ? {} : { diagnostics })}
              onNotice={announce}
              onReady={(handle) => {
                handleRef.current = handle
                onApplyReady?.(handle === undefined ? undefined : applyText)
              }}
            />
          )}
        </section>

        <section className="noter-pane" data-pane="preview" aria-label="プレビュー">
          {preview ?? <p className="noter-preview__waiting">プレビューは準備中です</p>}
        </section>
      </div>

      {/*
        提案は本文を読み返しながら判断するものなので、モーダルにしない。
        ワークスペースの下に敷き、分割の 2 ペインを潰さない
      */}
      {proposal}

      {diagnostics === undefined || !problemsOpen ? undefined : (
        <section className="noter-problems" aria-label="問題">
          {diagnostics.length === 0 ? (
            <p>問題はありません。</p>
          ) : (
            <ul>
              {diagnostics.map((diagnostic) => (
                <li key={`${diagnostic.line}:${diagnostic.column}:${diagnostic.message}`}>
                  <button
                    type="button"
                    onClick={() => handleRef.current?.goTo(diagnostic.line, diagnostic.column)}
                  >
                    {`${diagnostic.line} 行目 ${diagnostic.column} 列: ${diagnostic.message}`}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <LiveRegion message={announcer.message} />
      {shareDialog}
      {namePrompt}
    </>
  )
}
