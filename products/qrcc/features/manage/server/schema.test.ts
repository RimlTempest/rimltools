import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 一覧・編集・共有が使う D1 スキーマを、実物の SQLite に当てて確かめる。
 *
 * D1 は SQLite なので、同じマイグレーションを `bun:sqlite` のインメモリ DB に
 * 流せば Worker を起動せずに制約を検証できる（Small のまま実物を試せる）。
 */
const MIGRATIONS_DIR = join(import.meta.dir, '../../../apps/api/migrations')

const applyMigrations = (): Database => {
  const db = new Database(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const name of readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .toSorted()) {
    db.exec(readFileSync(join(MIGRATIONS_DIR, name), 'utf8'))
  }
  return db
}

const columnNames = (db: Database, table: string): readonly string[] =>
  db
    .query<{ name: string }, []>(`PRAGMA table_info("${table}")`)
    .all()
    .map((row) => row.name)

const OWNER = 'usr_0123456789abcdefghjkmnpq'
const OTHER = 'usr_0123456789abcdefghjkmnpr'

const insertFolder = (db: Database, id: string, owner = OWNER, name = '仕事') =>
  db.run('INSERT INTO folder (id, owner_id, name, created_at, updated_at) VALUES (?, ?, ?, 0, 0)', [
    id,
    owner,
    name,
  ])

const insertCode = (
  db: Database,
  id: string,
  over: { owner?: string; folder?: string | null; name?: string; key?: string | null } = {},
) =>
  db.run(
    'INSERT INTO code (id, owner_id, folder_id, name, kind, payload, symbology, style, idempotency_key, created_at, updated_at)'
      + ' VALUES (?, ?, ?, ?, \'qr\', \'{"kind":"text","text":"a"}\', \'{"kind":"qr","ec":"M"}\', \'{}\', ?, 0, 0)',
    [id, over.owner ?? OWNER, over.folder ?? null, over.name ?? '在庫ラベル', over.key ?? null],
  )

const insertShare = (
  db: Database,
  token: string,
  codeId: string,
  over: { permission?: string; key?: string | null } = {},
) =>
  db.run(
    'INSERT INTO share_link (token, code_id, permission, expires_at, created_by, created_at, revoked_at, idempotency_key)'
      + ' VALUES (?, ?, ?, NULL, ?, 0, NULL, ?)',
    [token, codeId, over.permission ?? 'view', OWNER, over.key ?? null],
  )

describe('管理用の D1 スキーマ', () => {
  test('code / folder / share_link を作る', () => {
    const db = applyMigrations()
    const names = db
      .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => row.name)
    expect(names).toContain('code')
    expect(names).toContain('folder')
    expect(names).toContain('share_link')
  })

  /**
   * 列名を変えると features/auth の promotion-store（OWNED_TABLES）が
   * 静かに壊れ、ゲスト → Google の移譲でデータが取り残される。
   */
  test('所有者列は owner_id という名前である', () => {
    const db = applyMigrations()
    expect(columnNames(db, 'code')).toContain('owner_id')
    expect(columnNames(db, 'folder')).toContain('owner_id')
  })

  /** 無料枠の row read を節約するため、検索列だけを実列に出す。 */
  test('symbology / style / payload は JSON 1 列にまとめる', () => {
    const columns = columnNames(applyMigrations(), 'code')
    for (const column of ['payload', 'symbology', 'style']) expect(columns).toContain(column)
    for (const searchable of ['kind', 'name', 'updated_at', 'folder_id', 'owner_id']) {
      expect(columns).toContain(searchable)
    }
    // 種類ごとの設定が実列に漏れていないこと
    expect(columns).not.toContain('ec')
    expect(columns).not.toContain('foreground')
  })

  test('フォルダを消してもコードは残り、フォルダ未所属になる', () => {
    const db = applyMigrations()
    insertFolder(db, 'fld_0123456789abcdefghjkmnpq')
    insertCode(db, 'cd_0123456789abcdefghjkmnpq', { folder: 'fld_0123456789abcdefghjkmnpq' })
    db.run('DELETE FROM folder WHERE id = ?', ['fld_0123456789abcdefghjkmnpq'])
    const rows = db.query<{ folder_id: string | null }, []>('SELECT folder_id FROM code').all()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.folder_id).toBeNull()
  })

  test('コードを消すと共有リンクも消える', () => {
    const db = applyMigrations()
    insertCode(db, 'cd_0123456789abcdefghjkmnpq')
    insertShare(db, 'abcdefghjkmnpqrstvwxyz0123456789', 'cd_0123456789abcdefghjkmnpq')
    db.run('DELETE FROM code WHERE id = ?', ['cd_0123456789abcdefghjkmnpq'])
    expect(db.query('SELECT token FROM share_link').all()).toHaveLength(0)
  })

  /** 同じ Idempotency-Key の再送で 2 件目を作らせないための最後の砦。 */
  test('所有者ごとに同じ冪等キーのコードは 1 件しか作れない', () => {
    const db = applyMigrations()
    insertCode(db, 'cd_0123456789abcdefghjkmnpq', { key: 'key-1' })
    expect(() => insertCode(db, 'cd_0123456789abcdefghjkmnpr', { key: 'key-1' })).toThrow()
    // 別の所有者なら同じキーでも作れる
    expect(() =>
      insertCode(db, 'cd_0123456789abcdefghjkmnps', { key: 'key-1', owner: OTHER }),
    ).not.toThrow()
  })

  /** 冪等キーなしの作成は何件でもできる（NULL は一意制約の対象外）。 */
  test('冪等キーのないコードは何件でも作れる', () => {
    const db = applyMigrations()
    insertCode(db, 'cd_0123456789abcdefghjkmnpq')
    expect(() => insertCode(db, 'cd_0123456789abcdefghjkmnpr')).not.toThrow()
  })

  test('共有リンクの権限は view か edit だけ', () => {
    const db = applyMigrations()
    insertCode(db, 'cd_0123456789abcdefghjkmnpq')
    expect(() =>
      insertShare(db, 'abcdefghjkmnpqrstvwxyz0123456789', 'cd_0123456789abcdefghjkmnpq', {
        permission: 'admin',
      }),
    ).toThrow()
  })

  /**
   * カーソルページングは並べ替えキーと id の複合で進むので、
   * その順序どおりの索引がないと全行走査になる。
   */
  test('一覧の並べ替えを索引で賄える', () => {
    const db = applyMigrations()
    const indexes = db
      .query<{ name: string; tbl_name: string }, []>(
        "SELECT name, tbl_name FROM sqlite_master WHERE type = 'index'",
      )
      .all()
      .filter((row) => row.tbl_name === 'code')
      .map((row) => row.name)
    expect(indexes).toContain('code_owner_updated_idx')
    expect(indexes).toContain('code_owner_name_idx')
  })
})
