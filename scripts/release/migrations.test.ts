import { describe, expect, test } from 'bun:test'

import { checkMigrations } from './migrations.ts'

describe('checkMigrations', () => {
  test('allows expand-only migrations', () => {
    const files = [
      {
        path: 'm/0002_add.sql',
        content: 'ALTER TABLE codes ADD COLUMN note TEXT;\nCREATE INDEX i ON codes(note);',
      },
    ]
    expect(checkMigrations(files)).toEqual([])
  })

  test('rejects destructive statements without a contract note', () => {
    const files = [
      { path: 'm/0003.sql', content: 'DROP TABLE old;' },
      { path: 'm/0004.sql', content: 'alter table codes drop column note;' },
      { path: 'm/0005.sql', content: 'ALTER TABLE codes RENAME COLUMN a TO b;' },
      { path: 'm/0006.sql', content: 'alter table codes rename to codes2;' },
    ]
    expect(checkMigrations(files).map((v) => v.path)).toEqual([
      'm/0003.sql',
      'm/0004.sql',
      'm/0005.sql',
      'm/0006.sql',
    ])
  })

  test('accepts destructive statements marked as the contract phase', () => {
    const files = [
      {
        path: 'm/0007.sql',
        content: '-- contract: codes.note unused since v42\nALTER TABLE codes DROP COLUMN note;',
      },
    ]
    expect(checkMigrations(files)).toEqual([])
  })

  test('ignores keywords inside comments', () => {
    const files = [
      { path: 'm/0008.sql', content: '-- we will DROP TABLE later\nCREATE TABLE t (id TEXT);' },
    ]
    expect(checkMigrations(files)).toEqual([])
  })
})
