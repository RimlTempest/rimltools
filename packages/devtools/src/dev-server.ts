/**
 * portless（docs/local-dev.md）が dev サーバに渡す環境変数を、Vite と wrangler の設定に変える。
 *
 * portless はアプリに空きポートを `PORT`、待ち受け先を `HOST`、ブラウザから見える URL を
 * `PORTLESS_URL` で渡す。qrcc / noter の dev スクリプトは `bun run sw && vite dev` の複合
 * コマンドなので portless は `--port` を注入しない。そこで Vite の設定側で `PORT` を読む。
 * portless を使わない起動（`PORT` 無し）では、これまでどおり各ツールの既定に任せる。
 */

import type { Result } from '@rimltools/contract'
import { err, ok, parseLocalDevOrigin } from '@rimltools/contract'

export type DevEnv = Readonly<Record<string, string | undefined>>

export type DevServerOptions = {
  port?: number
  host?: string
  /** portless が割り当てたポートからずれると、プロキシから届かなくなる */
  strictPort: boolean
}

const parsePort = (value: string): Result<number, string> => {
  if (!/^\d+$/.test(value)) return err(`PORT must be an integer, got "${value}"`)
  const port = Number(value)
  if (port < 1 || port > 65_535) return err(`PORT must be between 1 and 65535, got ${port}`)
  return ok(port)
}

export const devServerOptions = (env: DevEnv): Result<DevServerOptions, string> => {
  const rawPort = env['PORT']
  if (rawPort === undefined || rawPort === '') return ok({ strictPort: false })
  const port = parsePort(rawPort)
  if (!port.ok) return port
  const host = env['HOST']
  return ok({
    port: port.value,
    ...(host === undefined || host === '' ? {} : { host }),
    strictPort: true,
  })
}

/**
 * dev サーバの Worker に足す vars。`DEV_PUBLIC_ORIGIN` は、プロキシの後ろで http を受ける
 * Worker に「ブラウザが見ている https のオリジン」を伝える（Better Auth の baseURL・共有リンク）。
 * build では足さない（dist の wrangler.json に dev の値を残さない）。
 */
export const devWorkerVars = (env: DevEnv, command: 'serve' | 'build'): Record<string, string> => {
  if (command !== 'serve') return {}
  const url = env['PORTLESS_URL']
  if (url === undefined) return {}
  const origin = parseLocalDevOrigin(url)
  return origin.ok ? { DEV_PUBLIC_ORIGIN: origin.value } : {}
}

/** `wrangler dev` に渡すフラグ（portal など、Vite を使わないアプリ用） */
export const wranglerDevArgs = (env: DevEnv): Result<string[], string> => {
  const options = devServerOptions(env)
  if (!options.ok) return options
  const { port, host } = options.value
  return ok([
    ...(port === undefined ? [] : ['--port', String(port)]),
    ...(host === undefined ? [] : ['--ip', host]),
  ])
}
