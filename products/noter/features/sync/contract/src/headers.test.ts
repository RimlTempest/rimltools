import { MAX_DISPLAY_NAME, parseRole, parseUserId } from '@noter/contract'
import { describe, expect, test } from 'bun:test'
import type { RoomIdentity } from './headers.ts'
import { HEADER_ACTOR, HEADER_NAME, HEADER_ROLE, encodeIdentity, parseIdentity } from './headers.ts'

const actor = parseUserId('usr_0123456789abcdefghjkmnpq')
const owner = parseRole('owner')
if (!actor.ok || !owner.ok) throw new Error('fixture is invalid')

const identity = (name: string): RoomIdentity => ({
  role: owner.value,
  actorId: actor.value,
  name,
})

const roundTrip = (source: RoomIdentity) => parseIdentity(encodeIdentity(source))

describe('encodeIdentity / parseIdentity', () => {
  test('往復して同じ値に戻る', () => {
    const source = identity('Ada')
    const parsed = roundTrip(source)
    expect(parsed).toEqual({ ok: true, value: source })
  })

  test('日本語の表示名も往復する', () => {
    const source = identity('日本語の名前です')
    expect(roundTrip(source)).toEqual({ ok: true, value: source })
  })

  test('ヘッダ値は URL エンコードされ、生の非 ASCII を含まない', () => {
    const encoded = encodeIdentity(identity('日本語'))
    expect(encoded.get(HEADER_NAME)).toBe(encodeURIComponent('日本語'))
    expect(encoded.get(HEADER_ROLE)).toBe('owner')
    expect(encoded.get(HEADER_ACTOR)).toBe(actor.value)
  })

  test('33 文字の表示名は MAX_DISPLAY_NAME に切り詰める', () => {
    const long = 'あ'.repeat(MAX_DISPLAY_NAME + 1)
    const parsed = roundTrip(identity(long))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(Array.from(parsed.value.name)).toHaveLength(MAX_DISPLAY_NAME)
  })

  test('不正な role は invalid_identity(role)', () => {
    const headers = new Headers({
      [HEADER_ROLE]: 'admin',
      [HEADER_ACTOR]: actor.value,
      [HEADER_NAME]: 'Ada',
    })
    expect(parseIdentity(headers)).toEqual({
      ok: false,
      error: { kind: 'invalid_identity', field: 'role' },
    })
  })

  test('不正な actor は invalid_identity(actor)', () => {
    const headers = new Headers({
      [HEADER_ROLE]: 'viewer',
      [HEADER_ACTOR]: 'nope',
      [HEADER_NAME]: 'Ada',
    })
    expect(parseIdentity(headers)).toEqual({
      ok: false,
      error: { kind: 'invalid_identity', field: 'actor' },
    })
  })

  test('ヘッダが欠けていたら invalid_identity', () => {
    expect(parseIdentity(new Headers())).toEqual({
      ok: false,
      error: { kind: 'invalid_identity', field: 'role' },
    })
  })

  test('壊れたパーセントエンコードは invalid_identity(name)（例外にしない）', () => {
    const headers = new Headers({
      [HEADER_ROLE]: 'editor',
      [HEADER_ACTOR]: actor.value,
      [HEADER_NAME]: '%E0%A4%A',
    })
    expect(parseIdentity(headers)).toEqual({
      ok: false,
      error: { kind: 'invalid_identity', field: 'name' },
    })
  })

  test('空の表示名は invalid_identity(name)', () => {
    const headers = new Headers({
      [HEADER_ROLE]: 'editor',
      [HEADER_ACTOR]: actor.value,
      [HEADER_NAME]: '',
    })
    expect(parseIdentity(headers)).toEqual({
      ok: false,
      error: { kind: 'invalid_identity', field: 'name' },
    })
  })
})
