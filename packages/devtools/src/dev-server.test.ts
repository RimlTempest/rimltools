import { describe, expect, test } from 'bun:test'

import { devServerOptions, devWorkerVars, wranglerDevArgs } from './dev-server.ts'

describe('devServerOptions', () => {
  test('portless 無し（PORT 無し）は Vite の既定に任せる', () => {
    expect(devServerOptions({})).toEqual({ ok: true, value: { strictPort: false } })
  })

  test('PORT と HOST を使い、ポートがずれないよう strictPort にする', () => {
    expect(devServerOptions({ PORT: '4312', HOST: '127.0.0.1' })).toEqual({
      ok: true,
      value: { port: 4312, host: '127.0.0.1', strictPort: true },
    })
  })

  test.each(['0', '70000', 'abc', '43.5', '-1'])('不正な PORT %p は失敗にする', (port) => {
    expect(devServerOptions({ PORT: port }).ok).toBe(false)
  })
})

describe('devWorkerVars', () => {
  const env = { PORTLESS_URL: 'https://qrcc.rimltools.localhost' }

  test('dev サーバ（serve）では portless の URL を DEV_PUBLIC_ORIGIN にする', () => {
    expect(devWorkerVars(env, 'serve')).toEqual({
      DEV_PUBLIC_ORIGIN: 'https://qrcc.rimltools.localhost',
    })
  })

  test('build では何も足さない（成果物に dev の値を焼き込まない）', () => {
    expect(devWorkerVars(env, 'build')).toEqual({})
  })

  test('portless 無し、または .localhost 以外の値は無視する', () => {
    expect(devWorkerVars({}, 'serve')).toEqual({})
    expect(devWorkerVars({ PORTLESS_URL: 'https://example.com' }, 'serve')).toEqual({})
    expect(devWorkerVars({ PORTLESS_URL: 'http://qrcc.rimltools.localhost' }, 'serve')).toEqual({})
  })
})

describe('wranglerDevArgs', () => {
  test('PORT と HOST を wrangler dev のフラグにする', () => {
    expect(wranglerDevArgs({ PORT: '4401', HOST: '127.0.0.1' })).toEqual({
      ok: true,
      value: ['--port', '4401', '--ip', '127.0.0.1'],
    })
  })

  test('portless 無しなら wrangler の既定に任せる', () => {
    expect(wranglerDevArgs({})).toEqual({ ok: true, value: [] })
  })

  test('不正な PORT は失敗にする', () => {
    expect(wranglerDevArgs({ PORT: 'x' }).ok).toBe(false)
  })
})
