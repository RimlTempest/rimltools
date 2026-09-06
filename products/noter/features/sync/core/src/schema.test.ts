import { describe, expect, test } from 'bun:test'
import { SCHEMA_VERSION, loadState, migrate, saveState } from './schema.ts'
import { makeFakeStorage } from './tests/fakes.ts'

describe('migrate', () => {
  test('初回は schema_version を記録する', () => {
    const storage = makeFakeStorage()
    migrate(storage)
    const rows = storage.sql
      .exec('SELECT value FROM meta WHERE key = ?1', 'schema_version')
      .toArray()
    expect(rows).toEqual([{ value: String(SCHEMA_VERSION) }])
  })

  test('二重に当てても壊れない', () => {
    const storage = makeFakeStorage()
    migrate(storage)
    saveState(storage, new Uint8Array([1, 2, 3]), 10)
    migrate(storage)
    expect(loadState(storage)).toEqual(new Uint8Array([1, 2, 3]))
  })
})

describe('loadState / saveState', () => {
  test('保存前は null', () => {
    const storage = makeFakeStorage()
    migrate(storage)
    expect(loadState(storage)).toBeNull()
  })

  test('保存したバイト列をそのまま読み戻す', () => {
    const storage = makeFakeStorage()
    migrate(storage)
    saveState(storage, new Uint8Array([9, 8, 7]), 42)
    expect(loadState(storage)).toEqual(new Uint8Array([9, 8, 7]))
  })

  test('後から保存した内容で上書きされる（1 文書 1 行、ADR-0005）', () => {
    const storage = makeFakeStorage()
    migrate(storage)
    saveState(storage, new Uint8Array([1]), 1)
    saveState(storage, new Uint8Array([2, 2]), 2)
    expect(loadState(storage)).toEqual(new Uint8Array([2, 2]))
  })
})
