/**
 * D1 のテーブル定義（Drizzle）。
 *
 * **プロパティ名は Better Auth のフィールド名（camelCase）に合わせる。**
 * Drizzle アダプタは `schema[model][field]` で列を引くため、ここがずれると
 * 型は通るのに実行時だけ落ちる。列名は snake_case（docs/domain-model.md）。
 * 対応は `schema.test.ts` が `0001_auth.sql` と機械的に突き合わせる。
 *
 * 実体は `services/web/migrations/*.sql`。Drizzle のマイグレーション生成は使わない
 * （D1 は wrangler の連番マイグレーションで前方移行のみ運用する）。
 *
 * **`user.promoted_from` はここに書かない。** Better Auth の管理外の列で、
 * Drizzle アダプタは `select()` した列をそのままセッションの user に載せる。
 * 昇格元のゲスト ID をブラウザへ配りたくないので、生 SQL（promotion-store）
 * からだけ触る。
 */
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  /** ゲスト（匿名）ユーザーかどうか。anonymous プラグインが立てる。 */
  isAnonymous: integer('is_anonymous', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

/** Drizzle アダプタに渡すスキーマ。Better Auth のモデル名がキーになる。 */
export const authSchema = { user, session, account, verification } as const
