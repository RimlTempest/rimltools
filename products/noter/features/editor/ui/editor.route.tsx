import { Link, createFileRoute, notFound, useRouter } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'
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
import { ShareDialog } from '@noter/documents/ui'
import {
  browserCopyText,
  documentActions,
  documentStateFn,
  shareActions,
} from '@noter/documents/ui/wiring'
import type { DocumentState } from '@noter/documents/ui/wiring'
import {
  defaultViewMode,
  guestDisplayName,
  parseViewMode,
  presenceIndex,
  shouldPromptName,
  toEditorDiagnostics,
} from '@noter/editor/core'
import type { ViewMode } from '@noter/editor/contract'
import { EditorScreen, NamePrompt, useDocumentSync, useDocumentText } from '@noter/editor/ui'
import { diagnose } from '@noter/formats/core'
import type { NavLinkRenderer } from '@noter/shell/ui'
import { makeDocumentProvider } from '@noter/sync/client'
import type { ConnectionState } from '@noter/sync/contract'
import type * as Y from 'yjs'

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
      initialViewMode={initialViewMode}
      onViewModeChange={(mode) => writeLocal(VIEW_MODE_KEY, mode)}
      renderLink={routerLink}
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
