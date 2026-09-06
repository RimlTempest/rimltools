import { describe, expect, test } from 'bun:test'
import type { ServiceWorkerContainerLike } from './register-sw.ts'
import { registerServiceWorker } from './register-sw.ts'

describe('registerServiceWorker', () => {
  test('対応していない環境（undefined）では何もせず例外も投げない', () => {
    expect(() => {
      registerServiceWorker(undefined)
    }).not.toThrow()
  })

  test('対応環境では 1 回だけ登録する', () => {
    let calls = 0
    let requestedUrl: string | undefined
    const container: ServiceWorkerContainerLike = {
      register: (scriptURL) => {
        calls += 1
        requestedUrl = scriptURL
        return Promise.resolve(undefined)
      },
    }

    registerServiceWorker(container)

    expect(calls).toBe(1)
    expect(requestedUrl).toBe('/sw.js')
  })

  test('登録が失敗しても例外を投げない', async () => {
    const container: ServiceWorkerContainerLike = {
      register: () => Promise.reject(new Error('boom')),
    }

    expect(() => {
      registerServiceWorker(container)
    }).not.toThrow()

    // reject が未処理のまま残らないことを確かめるため、マイクロタスクの
    // 処理が終わるまで待つ
    await Promise.resolve()
    await Promise.resolve()
  })
})
