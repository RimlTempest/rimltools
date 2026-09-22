import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { buildAuthOptions } from './auth-options.ts'
import { authSchema } from './schema.ts'

/**
 * 本物の Better Auth（この版）を、本物の migration を当てた SQLite に繋いで確かめる（Medium）。
 *
 * better-auth 1.7.3 以降は起動時にスキーマを検証し、「Better Auth が書かない必須列」などの不一致が
 * あると認証リクエストを拒否する。1.7.2 までの account.issuer（NOT NULL）が残っていると、
 * Google の新規サインインとゲストの昇格（どちらも account を作る）が失敗する。
 * e2e はゲストのサインインしか通らないので、account の作成はここで確かめる。
 */
const MIGRATIONS_DIR = join(import.meta.dir, '../../../apps/api/migrations')

const migratedDatabase = (): Database => {
  const sqlite = new Database(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  for (const name of readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .toSorted()) {
    sqlite.exec(readFileSync(join(MIGRATIONS_DIR, name), 'utf8'))
  }
  return sqlite
}

const makeTestAuth = (sqlite: Database) =>
  betterAuth(
    buildAuthOptions({
      baseURL: 'https://qrcc.test',
      // 秘密鍵らしい文字列をコミットしないよう、実行のたびに作る
      secret: crypto.randomUUID(),
      google: { clientId: 'google-id', clientSecret: 'google-secret' },
      randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
      database: drizzleAdapter(drizzle(sqlite), {
        provider: 'sqlite',
        schema: authSchema,
        transaction: false,
      }),
      onLinkAccount: async () => {},
    }),
  )

describe('better-auth と D1 のスキーマ（account.issuer の廃止後）', () => {
  test('起動時のスキーマ検証を通り、ゲストのサインインが成功する', async () => {
    const auth = makeTestAuth(migratedDatabase())
    const response = await auth.handler(
      new Request('https://qrcc.test/api/auth/sign-in/anonymous', {
        method: 'POST',
        headers: { origin: 'https://qrcc.test', 'content-type': 'application/json' },
        body: '{}',
      }),
    )
    expect(response.status).toBe(200)
  })

  test('issuer を書かずに account を作れる（Google 連携と同じ書き込み）', async () => {
    const sqlite = migratedDatabase()
    const auth = makeTestAuth(sqlite)
    const context = await auth.$context
    const user = await context.internalAdapter.createUser({
      email: 'me@example.com',
      name: 'me',
      emailVerified: true,
    })
    await context.internalAdapter.linkAccount({
      userId: user.id,
      providerId: 'google',
      accountId: 'google-123',
    })
    expect(sqlite.query('SELECT provider_id, account_id, issuer FROM account').all()).toEqual([
      { provider_id: 'google', account_id: 'google-123', issuer: null },
    ])
  })
})
