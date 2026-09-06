import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
// DOMPurify を読み込む import より前に評価する（理由は当該ファイル）。
// oxlint-disable-next-line import/no-unassigned-import -- テスト環境の当て木（副作用のみ）
import '@noter/formats/ui/test-setup'
import { DocumentPreview } from './document-preview.tsx'

afterEach(cleanup)

describe('DocumentPreview', () => {
  test('markdown は組版した本文を出す', () => {
    render(<DocumentPreview kind="markdown" text={'# 設計メモ\n'} />)
    expect(screen.getByRole('heading', { level: 1, name: '設計メモ' })).toBeDefined()
  })

  test('json はツリーで出す', () => {
    render(<DocumentPreview kind="json" text={'{"a": 1}'} />)
    expect(screen.getByRole('button', { name: 'ツリーで表示' })).toBeDefined()
    expect(screen.getByText('a')).toBeDefined()
  })

  test('yaml もデータのプレビューになる', () => {
    render(<DocumentPreview kind="yaml" text={'a: 1\n'} />)
    expect(screen.getByRole('button', { name: 'テキストで表示' })).toBeDefined()
  })

  /** プレビュー枠（`aria-label="プレビュー"`）と同じ名前のランドマークを重ねない。 */
  test('既定のランドマーク名はプレビュー枠と重ならない', () => {
    render(<DocumentPreview kind="markdown" text={'本文\n'} />)
    expect(screen.getByRole('region', { name: '本文のプレビュー' })).toBeDefined()
    expect(screen.queryByRole('region', { name: 'プレビュー' })).toBeNull()
  })
})
