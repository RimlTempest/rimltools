/**
 * ローカル開発の公開オリジン（portless が割り当てる `https://<name>.localhost`）の検証。
 *
 * dev サーバはプロキシの後ろで http を受けるので、リクエストの URL からは
 * ブラウザが見ている https のオリジンが分からない。そこで portless が渡す URL を
 * Worker に伝えて使う（docs/local-dev.md）。ただし値を信じる範囲は、次の名前の https に限る。
 * 本番に誤って値が入っても、任意のドメインへリダイレクトさせる穴にならない。
 *
 * - `localhost` と `*.localhost`（RFC 6761 でループバックに限られる名前。portless の既定）
 * - `*.local.riml4i.com`（自分のドメインの下のローカル専用 TLD。Google は `.localhost` の
 *   リダイレクト URI を受け付けないので、`PORTLESS_TLD=local.riml4i.com` で使う）
 */

import type { Result } from './result.ts'
import { err, ok } from './result.ts'

export type LocalDevOriginError = 'invalid' | 'not-https' | 'not-localhost'

/** サブドメインだけを許す、ローカル専用のドメイン（そのもののホストは許さない） */
export const LOCAL_DEV_DOMAINS = ['localhost', 'local.riml4i.com'] as const

const isLocalhostName = (hostname: string): boolean =>
  hostname === 'localhost' || LOCAL_DEV_DOMAINS.some((domain) => hostname.endsWith(`.${domain}`))

export const parseLocalDevOrigin = (value: string): Result<string, LocalDevOriginError> => {
  if (!URL.canParse(value)) return err('invalid')
  const url = new URL(value)
  if (url.username !== '' || url.password !== '') return err('invalid')
  if (url.protocol !== 'https:') return err('not-https')
  if (!isLocalhostName(url.hostname)) return err('not-localhost')
  return ok(url.origin)
}

/**
 * ブラウザから見える公開オリジン。dev サーバが `DEV_PUBLIC_ORIGIN`（portless の URL）を
 * 渡していればそれを、無い・不正なら従来どおりリクエストのオリジンを使う。
 */
export const resolvePublicOrigin = (
  devPublicOrigin: string | undefined,
  requestOrigin: string,
): string => {
  if (devPublicOrigin === undefined || devPublicOrigin === '') return requestOrigin
  const parsed = parseLocalDevOrigin(devPublicOrigin)
  return parsed.ok ? parsed.value : requestOrigin
}

/** Worker の env（型の無いオブジェクト）から `DEV_PUBLIC_ORIGIN` を読んで `resolvePublicOrigin` する */
export const resolvePublicOriginFromEnv = (env: unknown, requestOrigin: string): string => {
  if (typeof env !== 'object' || env === null) return requestOrigin
  const value: unknown = Reflect.get(env, 'DEV_PUBLIC_ORIGIN')
  return resolvePublicOrigin(typeof value === 'string' ? value : undefined, requestOrigin)
}
