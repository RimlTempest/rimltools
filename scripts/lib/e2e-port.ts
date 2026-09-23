/**
 * e2e（Playwright）が立てるプレビューサーバのポートを決める。
 *
 * 以前は作業ツリーのパスのハッシュ（1000 通り）で決めていたため、並行作業の別のツリーや
 * 別のプロダクトと同じポートになり、テストの途中でサーバが消えることがあった。
 * いまは OS に空きポートを 1 回だけ聞き、環境変数に書き残す。Playwright は設定ファイルを
 * worker ごとに読み直すが、worker は runner の環境変数を受け継ぐので、全員が同じポートを使う。
 */

import { execFileSync } from 'node:child_process'

const PORT_RANGE = { min: 1024, max: 65535 }

const parsePort = (value: string | undefined): number | null => {
  if (value === undefined || !/^\d+$/.test(value)) return null
  const port = Number(value)
  return port >= PORT_RANGE.min && port <= PORT_RANGE.max ? port : null
}

/** 環境変数にポートがあればそれを使い、無ければ allocate で取って書き残す */
export const resolveE2ePort = (
  env: Record<string, string | undefined>,
  name: string,
  allocate: () => number,
): number => {
  const existing = parsePort(env[name])
  if (existing !== null) return existing
  const port = allocate()
  env[name] = String(port)
  return port
}

// ポート 0 で listen して OS が割り当てた番号を返す（設定ファイルは同期で評価されるので子プロセスで）
const LISTEN_ON_ZERO =
  "const s=require('node:net').createServer();s.listen(0,'127.0.0.1',()=>{process.stdout.write(String(s.address().port));s.close()})"

export const allocateFreePort = (): number =>
  Number(execFileSync(process.execPath, ['-e', LISTEN_ON_ZERO], { encoding: 'utf8' }).trim())
