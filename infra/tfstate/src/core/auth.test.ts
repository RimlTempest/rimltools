import { describe, expect, test } from 'bun:test'

import { authorize, constantTimeEqual, parseBasicAuth } from './auth.ts'

const basic = (user: string, pass: string) => `Basic ${btoa(`${user}:${pass}`)}`

const READ_PASSWORD = 'read-secret-0123456789abcdef0123456789'
const WRITE_PASSWORD = 'write-secret-0123456789abcdef0123456789'
const creds = {
  read: { user: 'reader', password: READ_PASSWORD },
  write: { user: 'writer', password: WRITE_PASSWORD },
}

describe('parseBasicAuth', () => {
  test('decodes user and password', () => {
    expect(parseBasicAuth(basic('a', 'b:c'))).toEqual({
      ok: true,
      value: { user: 'a', password: 'b:c' },
    })
  })

  test.each([null, '', 'Bearer x', 'Basic !!!', `Basic ${btoa('nocolon')}`])(
    'rejects %p',
    (header) => {
      expect(parseBasicAuth(header).ok).toBe(false)
    },
  )
})

describe('constantTimeEqual', () => {
  test('compares strings of any length', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true)
    expect(constantTimeEqual('abc', 'abd')).toBe(false)
    expect(constantTimeEqual('abc', 'abcd')).toBe(false)
    expect(constantTimeEqual('', '')).toBe(true)
  })
})

describe('authorize', () => {
  test('read credentials may only GET', () => {
    const header = basic('reader', READ_PASSWORD)
    expect(authorize(header, 'GET', creds)).toEqual({ ok: true, value: 'read' })
    for (const method of ['POST', 'DELETE', 'LOCK', 'UNLOCK']) {
      const result = authorize(header, method, creds)
      expect(result).toEqual({ ok: false, error: 'forbidden' })
    }
  })

  test('write credentials may use every method', () => {
    const header = basic('writer', WRITE_PASSWORD)
    for (const method of ['GET', 'POST', 'DELETE', 'LOCK', 'UNLOCK']) {
      expect(authorize(header, method, creds)).toEqual({ ok: true, value: 'write' })
    }
  })

  test('wrong password or user is unauthorized', () => {
    expect(authorize(basic('writer', 'nope'), 'GET', creds)).toEqual({
      ok: false,
      error: 'unauthorized',
    })
    expect(authorize(basic('reader', WRITE_PASSWORD), 'GET', creds)).toEqual({
      ok: false,
      error: 'unauthorized',
    })
    expect(authorize(null, 'GET', creds)).toEqual({ ok: false, error: 'unauthorized' })
  })

  test('requires configured passwords of at least 32 characters', () => {
    const short = {
      read: { user: 'r', password: 'x'.repeat(31) },
      write: { user: 'w', password: 'y'.repeat(32) },
    }
    expect(authorize(basic('w', 'y'.repeat(32)), 'GET', short)).toEqual({
      ok: false,
      error: 'misconfigured',
    })
    const enough = {
      read: { user: 'r', password: 'x'.repeat(32) },
      write: { user: 'w', password: 'y'.repeat(32) },
    }
    expect(authorize(basic('w', 'y'.repeat(32)), 'GET', enough)).toEqual({
      ok: true,
      value: 'write',
    })
  })

  test('refuses to run with empty or too short configured secrets', () => {
    const weak = { read: { user: 'r', password: '' }, write: { user: 'w', password: 'short' } }
    expect(authorize(basic('r', ''), 'GET', weak)).toEqual({ ok: false, error: 'misconfigured' })
  })
})
