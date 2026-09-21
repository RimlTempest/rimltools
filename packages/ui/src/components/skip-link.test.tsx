import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import { makeSkipLink } from './skip-link.tsx'

const SkipLink = makeSkipLink('rt')

afterEach(cleanup)

describe('SkipLink', () => {
  test('リンクとして描画され、行き先が単体で分かる文言を持つ', () => {
    render(<SkipLink targetId="main" />)
    const link = screen.getByRole('link', { name: '本文へスキップ' })
    expect(link.getAttribute('href')).toBe('#main')
  })

  test('文言は差し替えられる', () => {
    render(<SkipLink targetId="results">検索結果へスキップ</SkipLink>)
    expect(screen.getByRole('link', { name: '検索結果へスキップ' })).toBeDefined()
  })
})
