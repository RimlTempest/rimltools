import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ok, parseDocumentId, parseUserId } from '@noter/contract'
import type { DocumentHeader } from '@noter/documents/contract'
import * as Y from 'yjs'
import type { DocumentActions, EditorDiagnostic, FormatOutcome, Peer } from '../contract/index.ts'
import { EditorScreen } from './editor-screen.tsx'

afterEach(cleanup)

const id = (raw: string, prefix: string) => `${prefix}_${raw.padStart(24, '0')}`

const OWNER = (() => {
  const parsed = parseUserId(id('1', 'usr'))
  if (!parsed.ok) throw new Error('fixture')
  return parsed.value
})()

const documentOf = (kind: DocumentHeader['kind']): DocumentHeader => {
  const parsed = parseDocumentId(id('1', 'doc'))
  if (!parsed.ok) throw new Error('fixture')
  return {
    id: parsed.value,
    ownerId: OWNER,
    title: '設計メモ',
    kind,
    updatedAt: new Date('2026-09-06T03:04:05.000Z'),
  }
}

const NO_PEERS: readonly Peer[] = []

const ACTIONS: DocumentActions = {
  rename: async (title) => ok(title),
  remove: async () => ok(undefined),
  leave: async () => ok(undefined),
}

type Props = Parameters<typeof EditorScreen>[0]

/**
 * `awareness` を渡さない状態で描く。CodeMirror はブラウザでしか動かないので、
 * この画面の**props で決まるところ**（問題パネル・整形・プレビュー）だけを見る。
 */
const setup = (overrides: Partial<Props> = {}) => {
  const doc = new Y.Doc()
  const ytext = doc.getText('content')
  render(
    <EditorScreen
      document={documentOf('json')}
      actorRole="owner"
      ownerName="佐藤"
      connection={{ kind: 'connected' }}
      save={{ kind: 'saved', at: Date.parse('2026-09-06T03:04:05.000Z') }}
      peers={NO_PEERS}
      ytext={ytext}
      awareness={undefined}
      undoManager={new Y.UndoManager(ytext)}
      actions={ACTIONS}
      rawUrl="https://noter.example/d/doc/raw"
      copyText={async () => true}
      download={() => {}}
      initialViewMode="split"
      {...overrides}
    />,
  )
}

/** 画面にただ 1 つある読み上げ領域の中身。 */
const status = (): string | null => screen.getByRole('status').textContent

const DIAGNOSTICS: readonly EditorDiagnostic[] = [
  { line: 3, column: 5, message: '閉じ括弧がありません。' },
]

describe('EditorScreen の問題パネル', () => {
  test('指摘の件数をボタンに出す', () => {
    setup({ diagnostics: DIAGNOSTICS })
    expect(screen.getByRole('button', { name: '問題 1 件' })).toBeDefined()
  })

  test('開くと指摘の行・列と本文が読める', async () => {
    const user = userEvent.setup()
    setup({ diagnostics: DIAGNOSTICS })

    await user.click(screen.getByRole('button', { name: '問題 1 件' }))
    expect(
      screen.getByRole('button', { name: /3 行目 5 列: 閉じ括弧がありません。/ }),
    ).toBeDefined()
  })

  test('0 件でも開けて「問題はありません」と伝える', async () => {
    const user = userEvent.setup()
    setup({ diagnostics: [] })

    const toggle = screen.getByRole('button', { name: '問題 0 件' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    await user.click(toggle)
    expect(screen.getByText('問題はありません。')).toBeDefined()
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
  })

  test('Cmd/Ctrl + Shift + P で開閉できる', async () => {
    const user = userEvent.setup()
    setup({ diagnostics: DIAGNOSTICS })

    await user.keyboard('{Control>}{Shift>}P{/Shift}{/Control}')
    expect(screen.getByRole('region', { name: '問題' })).toBeDefined()

    await user.keyboard('{Control>}{Shift>}P{/Shift}{/Control}')
    expect(screen.queryByRole('region', { name: '問題' })).toBeNull()
  })

  test('指摘を渡さない画面には問題パネルを出さない', () => {
    setup()
    expect(screen.queryByRole('button', { name: /問題/ })).toBeNull()
  })
})

describe('EditorScreen の整形', () => {
  test('整形できたら本文を置き換えたことを読み上げる', async () => {
    const user = userEvent.setup()
    setup({ formatAction: () => ({ kind: 'formatted', text: '{\n  "a": 1\n}\n' }) })

    await user.click(screen.getByRole('button', { name: '整形' }))
    expect(status()).toBe('整形しました。')
  })

  test('すでに整形されているときは、そう伝える', async () => {
    const user = userEvent.setup()
    setup({ formatAction: () => ({ kind: 'unchanged' }) })

    await user.click(screen.getByRole('button', { name: '整形' }))
    expect(status()).toBe('すでに整形されています。')
  })

  test('整形できないときは問題パネルを開いて理由を読み上げる', async () => {
    const user = userEvent.setup()
    setup({ formatAction: () => ({ kind: 'failed' }), diagnostics: DIAGNOSTICS })

    await user.click(screen.getByRole('button', { name: '整形' }))
    expect(screen.getByRole('region', { name: '問題' })).toBeDefined()
    expect(status()).toBe('整形できません。問題を開いて、指摘された行を直してください。')
  })

  test('Cmd/Ctrl + Shift + F で整形する', async () => {
    const user = userEvent.setup()
    const outcomes: FormatOutcome[] = []
    setup({
      formatAction: () => {
        const outcome: FormatOutcome = { kind: 'unchanged' }
        outcomes.push(outcome)
        return outcome
      },
    })

    await user.keyboard('{Control>}{Shift>}F{/Shift}{/Control}')
    expect(outcomes).toHaveLength(1)
  })

  test('閲覧のみの人には整形ボタンを出さない', () => {
    setup({ actorRole: 'viewer', formatAction: () => ({ kind: 'unchanged' }) })
    expect(screen.queryByRole('button', { name: '整形' })).toBeNull()
  })

  test('整形を渡さない画面（markdown）には整形ボタンを出さない', () => {
    setup({ document: documentOf('markdown') })
    expect(screen.queryByRole('button', { name: '整形' })).toBeNull()
  })
})

describe('EditorScreen の変換して新規作成', () => {
  test('変換できたことを読み上げる', async () => {
    const user = userEvent.setup()
    const targets: string[] = []
    setup({
      convertAction: async (to) => {
        targets.push(to)
        return { kind: 'created' }
      },
    })

    await user.click(screen.getByRole('button', { name: 'YAML に変換して新規作成' }))
    await waitFor(() => {
      expect(status()).toBe('変換した文書を作りました。')
    })
    expect(targets).toEqual(['yaml'])
  })

  test('変換できないときは理由を読み上げる', async () => {
    const user = userEvent.setup()
    setup({
      convertAction: async () => ({
        kind: 'failed',
        message: 'TOML にできません。いちばん外側がキーと値の集まりである必要があります。',
      }),
    })

    await user.click(screen.getByRole('button', { name: 'TOML に変換して新規作成' }))
    await waitFor(() => {
      expect(status()).toBe(
        'TOML にできません。いちばん外側がキーと値の集まりである必要があります。',
      )
    })
  })

  test('指摘があるときは問題パネルを開いて直す場所を見せる', async () => {
    const user = userEvent.setup()
    setup({
      diagnostics: DIAGNOSTICS,
      convertAction: async () => ({ kind: 'failed', message: '変換できません。' }),
    })

    await user.click(screen.getByRole('button', { name: 'YAML に変換して新規作成' }))
    await waitFor(() => {
      expect(screen.getByRole('region', { name: '問題' })).toBeDefined()
    })
  })

  test('閲覧のみの人には変換して新規作成を出さない', () => {
    setup({ actorRole: 'viewer', convertAction: async () => ({ kind: 'created' }) })
    expect(screen.queryByRole('button', { name: /変換して新規作成/ })).toBeNull()
  })
})
