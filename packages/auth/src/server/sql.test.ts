import { describe, expect, test } from 'bun:test'

import { makeD1SqlRunner } from './sql.ts'

const statement = { sql: 'SELECT 1', params: [] }

const fakeDb = (outcome: 'ok' | 'throw') => ({
  prepare: () => {
    const prepared = {
      bind: () => prepared,
      all: async () => {
        if (outcome === 'throw') throw new Error('constraint failed')
        return { results: [{ a: 1 }, 'not a row'], meta: { changes: 2 } }
      },
    }
    return prepared
  },
  batch: async () => {
    if (outcome === 'throw') throw new Error('constraint failed')
    return [{ meta: { changes: 1 } }, {}]
  },
})

describe('makeD1SqlRunner', () => {
  test('returns rows, changed counts and batch counts', async () => {
    const sql = makeD1SqlRunner(fakeDb('ok'))
    expect(await sql.all(statement)).toEqual({ ok: true, value: [{ a: 1 }] })
    expect(await sql.run(statement)).toEqual({ ok: true, value: 2 })
    expect(await sql.batch([statement, statement])).toEqual({ ok: true, value: [1, 0] })
  })

  test('turns D1 exceptions into values', async () => {
    const sql = makeD1SqlRunner(fakeDb('throw'))
    for (const result of [
      await sql.all(statement),
      await sql.run(statement),
      await sql.batch([statement]),
    ]) {
      expect(result).toEqual({
        ok: false,
        error: { kind: 'storage_unavailable', detail: 'Error: constraint failed' },
      })
    }
  })
})
