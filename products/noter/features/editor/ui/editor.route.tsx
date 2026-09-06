import { Link, createFileRoute, notFound, useRouter } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FILE_EXTENSION, MIME_TYPE } from '@noter/contract'
import { actorUserId, parseActorWire } from '@noter/auth/contract'
import type { Actor } from '@noter/auth/contract'
import { makeBrowserAuthActions } from '@noter/auth/ui'
import type { DocumentHeader } from '@noter/documents/contract'
import {
  parseDocumentWire,
  parseList,
  parseMemberSummaryWire,
  parseRoleOrViewer,
  parseShareLinkWire,
} from '@noter/documents/contract'
import { can } from '@noter/documents/core'
import { KIND_LABEL, ShareDialog } from '@noter/documents/ui'
import {
  browserCopyText,
  createDocumentFn,
  documentActions,
  documentStateFn,
  shareActions,
} from '@noter/documents/ui/wiring'
import type { DocumentState } from '@noter/documents/ui/wiring'
import {
  defaultViewMode,
  describeConvertError,
  guestDisplayName,
  parseViewMode,
  presenceIndex,
  shouldPromptName,
  toEditorDiagnostics,
} from '@noter/editor/core'
import type { ConvertOutcome, FormatOutcome, ViewMode } from '@noter/editor/contract'
import {
  DocumentPreview,
  EditorScreen,
  NamePrompt,
  ProposalPanel,
  stashInitialBody,
  takeInitialBody,
  useDocumentSync,
  useDocumentText,
} from '@noter/editor/ui'
import type { DataDocumentKind } from '@noter/formats/contract'
import { isDataDocumentKind } from '@noter/formats/contract'
import { convertDocument, diagnose, formatDocument } from '@noter/formats/core'
import type { NavLinkRenderer } from '@noter/shell/ui'
import { makeDocumentProvider } from '@noter/sync/client'
import type { ConnectionState } from '@noter/sync/contract'
import { recallDocumentList, registerDocumentTools } from '@noter/webmcp'
import type * as Y from 'yjs'

const FAILED_TO_CONVERT = '変換できません。この文書は変換の対象ではありません。'
const FAILED_TO_CREATE = '新しい文書を作れませんでした。時間をおいてもう一度試してください。'

const DISPLAY_NAME_KEY = 'noter-display-name'
const VIEW_MODE_KEY = 'noter-view-mode'

const routerLink: NavLinkRenderer = ({ to, label, isCurrent }) => (
  <Link to={to} {...(isCurrent ? { 'aria-current': 'page' } : {})}>
    {label}
  </Link>
)

/** localStorage は private モードや設定で落ちる。読めなくても画面は動く。 */
const readLocal = (key: string): string | undefined => {
  try {
    return globalThis.localStorage.getItem(key) ?? undefined
  } catch {
    return undefined
  }
}

const writeLocal = (key: string, value: string): void => {
  try {
    globalThis.localStorage.setItem(key, value)
  } catch {
    // 覚えられないだけ。この画面の機能は失われない
  }
}

/** 端末に保存する。`URL.createObjectURL` は使い終わったら必ず解放する。 */
const downloadText = (document: DocumentHeader, text: string): void => {
  const blob = new Blob([text], { type: `${MIME_TYPE[document.kind]};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const anchor = globalThis.document.createElement('a')
  anchor.href = url
  anchor.download = `${document.title}.${FILE_EXTENSION[document.kind]}`
  anchor.click()
  URL.revokeObjectURL(url)
}

type EditorProps = {
  readonly state: DocumentState
  readonly document: DocumentHeader
  readonly actor: Actor
}

const Editor = ({ state, document, actor }: EditorProps) => {
  const router = useRouter()
  const actorRole = parseRoleOrViewer(state.role)
  const members = useMemo(() => parseList(state.members, parseMemberSummaryWire), [state.members])
  const links = useMemo(() => parseList(state.links, parseShareLinkWire), [state.links])

  const [wiring] = useState(() => ({
    actions: documentActions(document.id),
    share: shareActions(document.id),
    auth: makeBrowserAuthActions({ callbackURL: `/d/${document.id}` }),
  }))

  const [storedName, setStoredName] = useState(() => readLocal(DISPLAY_NAME_KEY))
  const [naming, setNaming] = useState(() =>
    shouldPromptName(actor, readLocal(DISPLAY_NAME_KEY), actorRole !== 'owner'),
  )
  const [shareOpen, setShareOpen] = useState(false)
  /** WebMCP から届いた提案の本文。`undefined` のあいだはパネルを出さない。 */
  const [proposal, setProposal] = useState<string | undefined>(undefined)
  /** 本文の差し替え口。`EditorScreen` が CodeMirror の準備できた時点で渡す。 */
  const applyText = useRef<((text: string) => void) | undefined>(undefined)

  const canEdit = can(actorRole, 'edit')

  const actorId = actorUserId(actor) ?? ''
  const displayName = storedName ?? (actor.kind === 'visitor' ? 'ゲスト' : actor.displayName)

  const connect = useCallback(
    (input: { readonly doc: Y.Doc; readonly onState: (next: ConnectionState) => void }) =>
      makeDocumentProvider({
        origin: state.origin,
        documentId: document.id,
        doc: input.doc,
        onState: input.onState,
      }),
    [state.origin, document.id],
  )

  // 閲覧のみの人は presence を送らない（覗き見感を出さない — can(role, 'presence')）
  const presence = useMemo(
    () =>
      can(actorRole, 'presence')
        ? { name: displayName, colorIndex: presenceIndex(actorId) }
        : undefined,
    [actorRole, displayName, actorId],
  )

  const sync = useDocumentSync({ connect, now: Date.now, presence })

  // 解析・診断・プレビューはすべてこの 1 本の本文から作る（Worker を使わない）
  const documentText = useDocumentText(sync.ytext)
  const diagnostics = useMemo(
    () => toEditorDiagnostics(diagnose(document.kind, documentText)),
    [document.kind, documentText],
  )

  const initialViewMode = useMemo<ViewMode>(
    () => parseViewMode(readLocal(VIEW_MODE_KEY)) ?? defaultViewMode(globalThis.innerWidth),
    [],
  )

  /**
   * 整形（`Cmd/Ctrl + Shift + F`）。ここは「整形するとどうなるか」だけを返し、
   * 本文の差し替えと読み上げは `EditorScreen` に任せる。
   */
  const formatAction = useCallback((): FormatOutcome => {
    const current = sync.ytext.toJSON()
    const formatted = formatDocument(document.kind, current)
    if (!formatted.ok) return { kind: 'failed' }
    return formatted.value === current
      ? { kind: 'unchanged' }
      : { kind: 'formatted', text: formatted.value }
  }, [document.kind, sync.ytext])

  /**
   * 「変換して新規作成」。文書の作成は初期本文を受け取れないので、
   * 変換した本文を sessionStorage に預け、新しい `/d/:id` を開いたときに
   * 入れる（下の useEffect）。
   */
  const convertAction = useCallback(
    async (to: DataDocumentKind): Promise<ConvertOutcome> => {
      const from = document.kind
      if (!isDataDocumentKind(from)) return { kind: 'failed', message: FAILED_TO_CONVERT }
      const converted = convertDocument(from, to, sync.ytext.toJSON())
      if (!converted.ok) {
        return { kind: 'failed', message: describeConvertError(converted.error, KIND_LABEL[to]) }
      }
      const created = await createDocumentFn({ data: to })
      const wire = created.ok ? parseDocumentWire(created.value) : undefined
      if (wire === undefined) return { kind: 'failed', message: FAILED_TO_CREATE }
      stashInitialBody(wire.id, converted.value)
      await router.navigate({ to: '/d/$documentId', params: { documentId: wire.id } })
      return { kind: 'created' }
    },
    [document.kind, sync.ytext, router],
  )

  // 変換して作った文書を開いたときだけ、預けた本文を 1 回だけ入れる
  useEffect(() => {
    if (sync.connection.kind !== 'connected') return
    const initial = takeInitialBody(document.id)
    if (initial === undefined || sync.ytext.length > 0) return
    sync.ytext.insert(0, initial)
  }, [sync.connection.kind, sync.ytext, document.id])

  /**
   * WebMCP のツール（ADR-0012）。
   *
   * 本文も指摘も打鍵のたびに変わるので、**ツールは 1 度だけ登録**して
   * 中身は ref から読む（登録し直すと打鍵のたびにブラウザの API を叩く）。
   * `propose-edit` はここで提案を預かるだけで、文書には触れない。
   */
  const live = useRef({ ytext: sync.ytext, kind: document.kind, diagnostics, canEdit })
  // 描画中に ref を書かない。ツールが呼ばれるのは描画のあと（ブラウザの
  // エージェント経由）なので、毎描画のあとに詰め替えれば足りる
  useEffect(() => {
    live.current = { ytext: sync.ytext, kind: document.kind, diagnostics, canEdit }
  })

  useEffect(
    () =>
      registerDocumentTools({
        readDocument: () => ({
          kind: live.current.kind,
          text: live.current.ytext.toJSON(),
        }),
        diagnose: () => live.current.diagnostics,
        // 一覧は文書一覧の画面が預けたものを返す（追加のリクエストを出さない）
        listDocuments: () => recallDocumentList(),
        // 閲覧のみの人には提案を出さない（適用できないものを見せない）
        proposeEdit: (text) => {
          if (live.current.canEdit) setProposal(text)
        },
      }),
    [],
  )

  const ownerName =
    members.find((member) => member.userId === document.ownerId)?.displayName ?? '所有者'

  const decideName = (name: string): void => {
    setStoredName(name)
    writeLocal(DISPLAY_NAME_KEY, name)
    setNaming(false)
    // 表示名の更新に失敗しても、この端末の presence には反映されている
    void wiring.auth.updateDisplayName(name).then(() => router.invalidate())
  }

  return (
    <EditorScreen
      document={document}
      actorRole={actorRole}
      ownerName={ownerName}
      connection={sync.connection}
      save={sync.save}
      peers={sync.peers}
      ytext={sync.ytext}
      awareness={sync.awareness}
      undoManager={sync.undoManager}
      actions={wiring.actions}
      rawUrl={`${state.origin}/d/${document.id}/raw`}
      copyText={browserCopyText}
      download={(text) => downloadText(document, text)}
      diagnostics={diagnostics}
      preview={<DocumentPreview kind={document.kind} text={documentText} />}
      {...(isDataDocumentKind(document.kind) ? { formatAction, convertAction } : {})}
      initialViewMode={initialViewMode}
      onViewModeChange={(mode) => writeLocal(VIEW_MODE_KEY, mode)}
      renderLink={routerLink}
      onApplyReady={(apply) => {
        applyText.current = apply
      }}
      proposal={
        proposal === undefined ? undefined : (
          <ProposalPanel
            open
            current={documentText}
            proposed={proposal}
            onApply={(text) => {
              applyText.current?.(text)
              setProposal(undefined)
            }}
            onDiscard={() => setProposal(undefined)}
          />
        )
      }
      {...(can(actorRole, 'share') ? { onShare: () => setShareOpen(true) } : {})}
      onChanged={() => void router.invalidate()}
      onLeft={() => void router.navigate({ to: '/' })}
      shareDialog={
        can(actorRole, 'share') ? (
          <ShareDialog
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            actor={actor}
            ownerId={document.ownerId}
            origin={state.origin}
            links={links}
            members={members}
            actions={wiring.share}
            onChanged={() => void router.invalidate()}
          />
        ) : undefined
      }
      namePrompt={
        <NamePrompt
          open={naming}
          defaultName={guestDisplayName(actorId)}
          onDecide={decideName}
          onSkip={() => setNaming(false)}
        />
      }
    />
  )
}

/**
 * `/d/:id`。エディタ本体（docs/design/ux.md §4.2）。
 *
 * `ssr: 'data-only'` にしてある。ローダー（誰が・どの権限で・どの文書か）は
 * サーバで走らせて 404 を正しく返しつつ、描画はクライアントだけで行う
 * （CodeMirror は DOM が要る）。
 *
 * 非メンバー・削除済み・visitor はすべて `notFound()`。存在の有無を
 * 区別させない（`DocumentId` は URL に出るため）。
 */
const EditorPage = () => {
  const state = Route.useLoaderData()
  const document = parseDocumentWire(state.document)
  if (document === undefined) return <p>この文書を表示できませんでした。</p>
  // key を付けて、別の文書へ移ったときに接続と Y.Doc を作り直す
  return (
    <Editor
      key={document.id}
      state={state}
      document={document}
      actor={parseActorWire(state.actor)}
    />
  )
}

export const Route = createFileRoute('/d/$documentId')({
  ssr: 'data-only',
  loader: async ({ params }) => {
    const state = await documentStateFn({ data: params.documentId })
    if (!state.ok) throw notFound()
    return state.value
  },
  component: EditorPage,
})
