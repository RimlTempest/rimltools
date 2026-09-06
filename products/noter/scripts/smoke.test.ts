import { describe, expect, test } from 'bun:test'
import type { AssetProbe } from './smoke.ts'
import { describeSmokeResult, referencedAssets, smokeVerdict } from './smoke.ts'

const html = (body: string) => `<!DOCTYPE html><html><head>${body}</head><body></body></html>`

describe('referencedAssets', () => {
  test('script と link から資産の URL を拾う', () => {
    const found = referencedAssets(
      html(
        '<link rel="stylesheet" href="/assets/app-a.css"/>'
          + '<link rel="modulepreload" href="/assets/home-b.js"/>'
          + '<script src="/assets/index-c.js"></script>',
      ),
    )
    expect(found).toEqual(['/assets/app-a.css', '/assets/home-b.js', '/assets/index-c.js'])
  })

  test('重複は 1 本にまとめる', () => {
    const found = referencedAssets(
      html('<link href="/assets/a.js"/><script src="/assets/a.js"></script>'),
    )
    expect(found).toEqual(['/assets/a.js'])
  })

  /** 外部 CDN やアイコンまで叩きに行くと、他人の障害でデプロイが落ちる。 */
  test('自分のオリジンの /assets 以外は見ない', () => {
    const found = referencedAssets(
      html('<script src="https://example.com/x.js"></script><link href="/favicon.ico"/>'),
    )
    expect(found).toEqual([])
  })
})

const ok = (path: string): AssetProbe => ({ path, status: 200, bytes: 1000 })

describe('smokeVerdict', () => {
  test('全部 200 なら合格', () => {
    expect(
      smokeVerdict({ documentStatus: 200, documentBytes: 9000, assets: [ok('/assets/a.js')] }),
    ).toEqual({ ok: true })
  })

  test('資産が 1 本でも 200 以外なら不合格', () => {
    const verdict = smokeVerdict({
      documentStatus: 200,
      documentBytes: 9000,
      assets: [ok('/assets/a.js'), { path: '/assets/b.js', status: 500, bytes: 0 }],
    })
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reasons).toContain('/assets/b.js が 500 を返した')
  })

  test('トップが 200 以外なら不合格', () => {
    const verdict = smokeVerdict({ documentStatus: 503, documentBytes: 0, assets: [] })
    expect(verdict.ok).toBe(false)
  })

  /**
   * 資産が 1 本も無いのは「HTML は返るがビルド成果物が繋がっていない」状態。
   * 200 だけ見ていると見逃すので、ここで落とす。
   */
  test('資産が 1 本も無ければ不合格', () => {
    const verdict = smokeVerdict({ documentStatus: 200, documentBytes: 9000, assets: [] })
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reasons.join()).toContain('資産が 1 本も見つからない')
  })

  test('空の資産が返るのも不合格', () => {
    const verdict = smokeVerdict({
      documentStatus: 200,
      documentBytes: 9000,
      assets: [{ path: '/assets/a.js', status: 200, bytes: 0 }],
    })
    expect(verdict.ok).toBe(false)
  })
})

describe('describeSmokeResult', () => {
  test('落ちた資産が結果に出る', () => {
    const text = describeSmokeResult({
      documentStatus: 200,
      documentBytes: 9000,
      assets: [{ path: '/assets/b.js', status: 500, bytes: 0 }],
    })
    expect(text).toContain('/assets/b.js')
    expect(text).toContain('500')
  })
})
