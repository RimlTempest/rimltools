import { useCallback, useEffect, useId, useState } from 'react'
import type { FolderId } from '@qrcc/contract'
import { parseNonEmptyText } from '@qrcc/contract'
import type { Actor } from '@qrcc/auth/contract'
import { canUse } from '@qrcc/auth/contract'
import { SYMBOLOGY_KINDS, SYMBOLOGY_META } from '@qrcc/generate/contract'
import type { CodeSort, CodeSummary, Folder, SavedCode, SortColumn } from '@qrcc/manage/contract'
import { DEFAULT_PAGE_SIZE } from '@qrcc/manage/contract'
import type { CodeFormState, CodeListState } from '@qrcc/manage/core'
import {
  NEW_CODE_FORM,
  appendPage,
  buildCodeDraft,
  firstPage,
  hasMore,
  indexOfCode,
  nextSortFor,
  removeCode,
  restoreCode,
  toRestoreDraft,
} from '@qrcc/manage/core'
import { describeManageFailure } from '@qrcc/manage/server'
import { Button, Field, LiveRegion } from '@qrcc/ui'
import { CodeTable } from './code-table.tsx'
import { ConfirmDialog } from './confirm-dialog.tsx'
import type { CodeLinkRenderer, ManageDeps } from './manage-deps.tsx'
import { defaultRenderLink } from './manage-deps.tsx'

type CodesScreenProps = {
  readonly actor: Actor
  readonly deps: ManageDeps
  readonly renderLink?: CodeLinkRenderer
}

/** 取り消しのために覚えておく、消す直前の姿と位置。 */
type Undoable = {
  readonly code: SavedCode
  readonly index: number
}

/**
 * 未サインインの案内。
 *
 * **できないことだけを言わない。** 生成と読み取りはこのまま使えることを
 * 添えて、サインインが「保存のためだけ」であることを伝える（ADR-0004）。
 */
const SignInGuidance = ({ renderLink }: { readonly renderLink: CodeLinkRenderer }) => (
  <>
    <h1>保存したコード</h1>
    <p>
      コードの保存・一覧・共有にはサインインが必要です。
      生成と読み取りは、サインインしなくてもこれまでどおり使えます。
    </p>
    <p>{renderLink({ to: '/sign-in', label: 'サインインの方法を見る' })}</p>
  </>
)

const SignedInCodes = ({
  actor,
  deps,
  renderLink,
}: {
  readonly actor: Actor
  readonly deps: ManageDeps
  readonly renderLink: CodeLinkRenderer
}) => {
  const [list, setList] = useState<CodeListState>({ items: [], nextCursor: undefined })
  const [folders, setFolders] = useState<readonly Folder[]>([])
  const [sort, setSort] = useState<CodeSort>('updated_desc')
  const [query, setQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [folderId, setFolderId] = useState<FolderId | undefined>(undefined)
  const [form, setForm] = useState<CodeFormState>(NEW_CODE_FORM)
  const [folderName, setFolderName] = useState('')
  /** 改名の途中の入力。フォルダ id ごとに覚える（保存するまで一覧には出さない）。 */
  const [renames, setRenames] = useState<Readonly<Record<string, string>>>({})
  const [pendingFolder, setPendingFolder] = useState<Folder | undefined>(undefined)
  const [message, setMessage] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<CodeSummary | undefined>(undefined)
  const [undoable, setUndoable] = useState<Undoable | undefined>(undefined)
  const contentGroup = useId()

  const { api } = deps

  /**
   * 一覧を読む。**状態の書き換えは呼び出し側に返す関数に閉じる。**
   * 応答が返ったころには条件が変わっているかもしれないので、
   * 「反映するかどうか」を待っていた側に決めさせる。
   */
  const load = useCallback(async () => {
    const page = await api.listCodes({
      folderId,
      query: query === '' ? undefined : query,
      sort,
      limit: DEFAULT_PAGE_SIZE,
    })
    return () => {
      if (page.ok) setList(firstPage(page.value))
      else setMessage(describeManageFailure(page.error))
    }
  }, [api, folderId, query, sort])

  const reload = async () => (await load())()

  // 絞り込みを続けて変えると要求が前後しうる。戻ってきた時点で
  // 条件が変わっていたら捨てる（古い結果で新しい表示を上書きしない）
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const apply = await load()
      if (!cancelled) apply()
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [load])

  const loadFolders = useCallback(async () => {
    const outcome = await api.listFolders()
    return () => {
      if (outcome.ok) setFolders(outcome.value)
    }
  }, [api])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const apply = await loadFolders()
      if (!cancelled) apply()
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [loadFolders])

  const readMore = async () => {
    const cursor = list.nextCursor
    if (cursor === undefined) return
    setBusy(true)
    const page = await api.listCodes({
      folderId,
      query: query === '' ? undefined : query,
      sort,
      limit: DEFAULT_PAGE_SIZE,
      cursor,
    })
    setBusy(false)
    if (!page.ok) {
      setMessage(describeManageFailure(page.error))
      return
    }
    setList((current) => appendPage(current, page.value))
  }

  const save = async () => {
    const id = deps.newCodeId()
    if (!id.ok) {
      setMessage('保存できませんでした（ID を発行できません）。ページを読み込み直してください。')
      return
    }
    const draft = buildCodeDraft(id.value, { ...form, folderId })
    if (!draft.ok) {
      setMessage(`${draft.error.field}: ${draft.error.reason}`)
      return
    }
    setBusy(true)
    const created = await api.createCode(draft.value, deps.newIdempotencyKey())
    setBusy(false)
    if (!created.ok) {
      setMessage(describeManageFailure(created.error))
      return
    }
    setForm(NEW_CODE_FORM)
    setMessage(`「${draft.value.name}」を保存しました。`)
    await reload()
  }

  const confirmDelete = async () => {
    const target = pendingDelete
    setPendingDelete(undefined)
    if (target === undefined) return

    setBusy(true)
    // 取り消せるようにするため、消す前に中身を控える（AAA 3.3.6）
    const detail = await api.getCode(target.id)
    const index = indexOfCode(list, target.id)
    const deleted = await api.deleteCode(target.id)
    setBusy(false)

    if (!deleted.ok) {
      setMessage(describeManageFailure(deleted.error))
      return
    }
    setList((current) => removeCode(current, target.id))
    setUndoable(detail.ok ? { code: detail.value.code, index } : undefined)
    setMessage(
      detail.ok
        ? `「${target.name}」を削除しました。すぐなら取り消せます。`
        : `「${target.name}」を削除しました。`,
    )
  }

  const undoDelete = async () => {
    const target = undoable
    if (target === undefined) return
    setBusy(true)
    // 同じ id で作り直すので、共有リンクの URL も編集画面の URL も変わらない
    const restored = await api.createCode(toRestoreDraft(target.code), deps.newIdempotencyKey())
    setBusy(false)
    if (!restored.ok) {
      setMessage(describeManageFailure(restored.error))
      return
    }
    setList((current) =>
      restoreCode(
        current,
        {
          id: target.code.id,
          name: target.code.name,
          symbologyKind: target.code.symbology.kind,
          folderId: target.code.folderId,
          updatedAt: target.code.updatedAt,
        },
        target.index,
      ),
    )
    setUndoable(undefined)
    setMessage(`「${target.code.name}」を元に戻しました。`)
  }

  const createFolder = async () => {
    const name = parseNonEmptyText(folderName.trim())
    if (!name.ok) {
      setMessage('フォルダの名前を入力してください。')
      return
    }
    const id = deps.newFolderId()
    if (!id.ok) {
      setMessage('フォルダを作れませんでした（ID を発行できません）。')
      return
    }
    setBusy(true)
    const created = await api.createFolder(
      { id: id.value, name: name.value },
      deps.newIdempotencyKey(),
    )
    setBusy(false)
    if (!created.ok) {
      setMessage(describeManageFailure(created.error))
      return
    }
    setFolderName('')
    setMessage(`フォルダ「${name.value}」を作りました。`)
    const applyFolders = await loadFolders()
    applyFolders()
  }

  const renameDraft = (target: Folder) => renames[target.id] ?? target.name

  const renameFolder = async (target: Folder) => {
    const name = parseNonEmptyText(renameDraft(target).trim())
    if (!name.ok) {
      setMessage('フォルダの名前を入力してください。')
      return
    }
    setBusy(true)
    const updated = await api.updateFolder({ id: target.id, name: name.value })
    setBusy(false)
    if (!updated.ok) {
      setMessage(describeManageFailure(updated.error))
      return
    }
    setRenames((current) => ({ ...current, [target.id]: name.value }))
    setMessage(`フォルダの名前を「${name.value}」に変えました。`)
    const applyFolders = await loadFolders()
    applyFolders()
  }

  /**
   * フォルダを消す。**中のコードは消えない**（D1 が `ON DELETE SET NULL`）。
   * 何が起きるかは消す前にダイアログで伝え、消したあとも読み上げで念を押す。
   */
  const confirmDeleteFolder = async () => {
    const target = pendingFolder
    setPendingFolder(undefined)
    if (target === undefined) return

    setBusy(true)
    const deleted = await api.deleteFolder(target.id)
    setBusy(false)
    if (!deleted.ok) {
      setMessage(describeManageFailure(deleted.error))
      return
    }
    // 消えたフォルダで絞り込んだままにしない（何も出ない一覧になる）
    if (folderId === target.id) setFolderId(undefined)
    setMessage(
      `フォルダ「${target.name}」を削除しました。中のコードは残っています（フォルダ未設定）。`,
    )
    const applyFolders = await loadFolders()
    applyFolders()
  }

  const changeSort = (column: SortColumn) => setSort((current) => nextSortFor(column, current))

  return (
    <>
      <h1>保存したコード</h1>
      <p>
        保存したコードを探して、名前や内容を直したり、共有リンクを作ったりできます。
        {actor.kind === 'guest'
          ? 'ゲストのままでも保存できますが、期限つきの共有リンクしか作れません。'
          : ''}
      </p>

      <LiveRegion message={message} />
      {undoable === undefined ? undefined : (
        <p className="qrcc-manage-undo">
          <Button variant="secondary" busy={busy} onClick={() => void undoDelete()}>
            削除を取り消す
          </Button>
        </p>
      )}

      <section aria-labelledby="qrcc-manage-new">
        <h2 id="qrcc-manage-new">新しいコードを保存する</h2>
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
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          />

          <fieldset>
            <legend>内容の種類</legend>
            <label>
              <input
                type="radio"
                name={contentGroup}
                checked={form.content.kind === 'url'}
                onChange={() =>
                  setForm((current) => ({ ...current, content: { kind: 'url', url: '' } }))
                }
              />
              URL
            </label>
            <label>
              <input
                type="radio"
                name={contentGroup}
                checked={form.content.kind === 'text'}
                onChange={() =>
                  setForm((current) => ({ ...current, content: { kind: 'text', text: '' } }))
                }
              />
              テキスト
            </label>
          </fieldset>

          {form.content.kind === 'url' ? (
            <Field
              label="リンク先の URL"
              type="url"
              inputMode="url"
              hint="http:// または https:// から始めてください。"
              value={form.content.url}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  content: { kind: 'url', url: event.target.value },
                }))
              }
            />
          ) : undefined}
          {form.content.kind === 'text' ? (
            <Field
              control="textarea"
              label="内容"
              hint="読み取ったときにそのまま表示される文字列です。"
              value={form.content.text}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  content: { kind: 'text', text: event.target.value },
                }))
              }
            />
          ) : undefined}

          <div className="qrcc-field">
            <label className="qrcc-field__label" htmlFor="qrcc-new-symbology">
              コードの種類
            </label>
            <select
              id="qrcc-new-symbology"
              className="qrcc-field__control"
              value={form.symbologyKind}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  symbologyKind:
                    SYMBOLOGY_KINDS.find((kind) => kind === event.target.value)
                    ?? current.symbologyKind,
                }))
              }
            >
              {SYMBOLOGY_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {SYMBOLOGY_META[kind].label}
                </option>
              ))}
            </select>
          </div>

          <Button type="submit" busy={busy}>
            保存する
          </Button>
        </form>
      </section>

      <section aria-labelledby="qrcc-manage-folders">
        <h2 id="qrcc-manage-folders">フォルダ</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void createFolder()
          }}
        >
          <Field
            label="新しいフォルダの名前"
            hint="コードをまとめる入れ物です。フォルダを消してもコードは残ります。"
            value={folderName}
            onChange={(event) => setFolderName(event.target.value)}
          />
          <Button type="submit" variant="secondary" busy={busy}>
            フォルダを作る
          </Button>
        </form>

        {folders.length === 0 ? (
          <p>まだフォルダはありません。上の入力欄から作れます。</p>
        ) : (
          <ul className="qrcc-folder-list">
            {folders.map((target) => (
              <li key={target.id}>
                {/* 1 フォルダ = 1 フォーム。Enter だけで改名まで届く */}
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    void renameFolder(target)
                  }}
                >
                  <Field
                    label={`「${target.name}」の新しい名前`}
                    value={renameDraft(target)}
                    onChange={(event) => {
                      const value = event.target.value
                      setRenames((current) => ({ ...current, [target.id]: value }))
                    }}
                  />
                  <div className="qrcc-folder-list__actions">
                    {/* どのフォルダの操作かをボタン名だけで分かるようにする */}
                    <Button type="submit" variant="secondary" busy={busy}>
                      「{target.name}」の名前を保存
                    </Button>
                    <Button variant="danger" busy={busy} onClick={() => setPendingFolder(target)}>
                      「{target.name}」を削除
                    </Button>
                  </div>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="qrcc-manage-list">
        <h2 id="qrcc-manage-list">保存したコードの一覧</h2>

        <form
          className="qrcc-manage-filters"
          onSubmit={(event) => {
            event.preventDefault()
            setQuery(searchInput.trim())
          }}
        >
          <Field
            label="名前で検索"
            type="search"
            hint="名前の一部を入れて検索します。"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <div className="qrcc-field">
            <label className="qrcc-field__label" htmlFor="qrcc-folder-filter">
              フォルダで絞り込む
            </label>
            <select
              id="qrcc-folder-filter"
              className="qrcc-field__control"
              value={folderId ?? ''}
              onChange={(event) =>
                setFolderId(folders.find((folder) => folder.id === event.target.value)?.id)
              }
            >
              <option value="">すべて</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="secondary">
            検索する
          </Button>
        </form>

        {list.items.length === 0 ? (
          <p>
            まだ保存したコードはありません。上の「新しいコードを保存する」から作るか、
            生成画面で作ったコードを保存してください。
          </p>
        ) : (
          <>
            <CodeTable
              items={list.items}
              folders={folders}
              sort={sort}
              onSort={changeSort}
              onDelete={setPendingDelete}
              renderLink={renderLink}
            />
            {hasMore(list) ? (
              <Button variant="secondary" busy={busy} onClick={() => void readMore()}>
                次のページを読み込む
              </Button>
            ) : undefined}
          </>
        )}
      </section>

      <ConfirmDialog
        open={pendingDelete !== undefined}
        title="コードを削除しますか？"
        description={
          pendingDelete === undefined
            ? ''
            : `「${pendingDelete.name}」を削除します。削除したあとでも、この画面にいる間なら取り消せます。`
        }
        confirmLabel="削除する"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(undefined)}
      />

      {/* 取り消せない操作なので、何が残って何が消えるかを消す前に示す（AAA 3.3.6） */}
      {pendingFolder === undefined ? undefined : (
        <ConfirmDialog
          open
          title="フォルダを削除しますか？"
          description={`「${pendingFolder.name}」を削除します。中のコードは削除されません。フォルダから外れて「フォルダ未設定」になるので、必要なら別のフォルダに入れ直してください。フォルダそのものは元に戻せません。`}
          confirmLabel="フォルダを削除する"
          cancelLabel="フォルダを残す"
          onConfirm={() => void confirmDeleteFolder()}
          onCancel={() => setPendingFolder(undefined)}
        />
      )}
    </>
  )
}

/**
 * 保存したコードの一覧・作成・削除。
 *
 * サインインの有無で見せるものを変える。未サインインでも画面自体は開けて、
 * 「なぜ使えないか」と「どうすれば使えるか」が分かるようにする。
 */
export const CodesScreen = ({ actor, deps, renderLink = defaultRenderLink }: CodesScreenProps) =>
  canUse(actor, 'list') ? (
    <SignedInCodes actor={actor} deps={deps} renderLink={renderLink} />
  ) : (
    <SignInGuidance renderLink={renderLink} />
  )
