/**
 * D1 のテーブル定義（Drizzle）。
 *
 * **プロパティ名は Better Auth のフィールド名（camelCase）に合わせる。**
 * Drizzle アダプタは `schema[model][field]` で列を引くため、ここがずれると
 * 型は通るのに実行時だけ落ちる。列名は qrcc の規約どおり snake_case
 * （docs/domain-model.md）。対応は `schema.test.ts` が機械的に検査する。
 *
 * 実体は `apps/api/migrations/*.sql`。Drizzle のマイグレーション生成は使わない
 * （D1 は wrangler の連番マイグレーションで前方移行のみ運用する）。
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
  // issuer は書かない（better-auth 1.7.3 で廃止。D1 には 0006 まで NULL 可で残る。schema.test.ts の PENDING_CONTRACT）
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

/**
 * ゲスト → Google の移譲済みフラグ。Better Auth の管理外なので
 * Drizzle アダプタには渡さない（SQL で直接読み書きする）。
 */
export const accountPromotion = sqliteTable('account_promotion', {
  fromUserId: text('from_user_id').primaryKey(),
  toUserId: text('to_user_id').notNull(),
  movedCodes: integer('moved_codes').notNull().default(0),
  movedFolders: integer('moved_folders').notNull().default(0),
  completedAt: integer('completed_at', { mode: 'timestamp' }).notNull(),
})

/** Drizzle アダプタに渡すスキーマ。Better Auth のモデル名がキーになる。 */
export const authSchema = { user, session, account, verification } as const
