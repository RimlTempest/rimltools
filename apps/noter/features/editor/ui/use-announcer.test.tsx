import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LiveRegion } from '@noter/ui'
import { useAnnouncer } from './use-announcer.ts'

afterEach(cleanup)

const CONNECTED = '接続しました'
const OFFLINE = 'オフラインです'
const SILENT = '無言'

const NOTHING: readonly (string | null)[] = []
const ONE: readonly (string | null)[] = [CONNECTED]
const WITH_SILENCE: readonly (string | null)[] = [CONNECTED, null]
const TWO: readonly (string | null)[] = [CONNECTED, OFFLINE]

const Harness = ({ texts }: { readonly texts: readonly (string | null)[] }) => {
  const announcer = useAnnouncer()
  return (
    <>
      {texts.map((text) => (
        <button key={text ?? SILENT} type="button" onClick={() => announcer.announce(text)}>
          {text ?? SILENT}
        </button>
      ))}
      <LiveRegion message={announcer.message} />
    </>
  )
}

const region = () => screen.getByRole('status')

describe('useAnnouncer', () => {
  test('領域は最初から DOM にある（後から挿入すると読まれない）', () => {
    render(<Harness texts={NOTHING} />)
    expect(region().textContent).toBe('')
  })

  test('読み上げたい文言を渡すと出る', async () => {
    render(<Harness texts={ONE} />)
    await userEvent.click(screen.getByRole('button', { name: CONNECTED }))
    expect(region().textContent).toBe(CONNECTED)
  })

  test('null は「読まない」であって「消す」ではない', async () => {
    render(<Harness texts={WITH_SILENCE} />)
    await userEvent.click(screen.getByRole('button', { name: CONNECTED }))
    await userEvent.click(screen.getByRole('button', { name: SILENT }))
    expect(region().textContent).toBe(CONNECTED)
  })

  test('同じ文言を続けて渡しても領域は変わらない（2 回読ませない）', async () => {
    render(<Harness texts={ONE} />)
    const button = screen.getByRole('button', { name: CONNECTED })
    await userEvent.click(button)
    const first = region()
    await userEvent.click(button)
    expect(region()).toBe(first)
    expect(region().textContent).toBe(CONNECTED)
  })

  test('違う文言なら差し替わる', async () => {
    render(<Harness texts={TWO} />)
    await userEvent.click(screen.getByRole('button', { name: CONNECTED }))
    await userEvent.click(screen.getByRole('button', { name: OFFLINE }))
    expect(region().textContent).toBe(OFFLINE)
  })

  test('画面の読み上げ領域は 1 つだけ', () => {
    render(<Harness texts={ONE} />)
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })
})
