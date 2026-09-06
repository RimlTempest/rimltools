import { describe, expect, test } from 'bun:test'
import type { AssetProbe, SmokeResult } from './smoke.ts'
import {
  WS_PROBE_PATH,
  describeSmokeResult,
  referencedAssets,
  runSmoke,
  smokeVerdict,
} from './smoke.ts'

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

/** 既定は「全部うまくいっている」状態。試したい 1 点だけを上書きする。 */
const result = (overrides: Partial<SmokeResult> = {}): SmokeResult => ({
  documentStatus: 200,
  documentBytes: 9000,
  assets: [ok('/assets/a.js')],
  wsProbe: 426,
  ...overrides,
})

describe('smokeVerdict', () => {
  test('全部 200 なら合格', () => {
    expect(smokeVerdict(result())).toEqual({ ok: true })
  })

  test('資産が 1 本でも 200 以外なら不合格', () => {
    const verdict = smokeVerdict(
      result({ assets: [ok('/assets/a.js'), { path: '/assets/b.js', status: 500, bytes: 0 }] }),
    )
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reasons).toContain('/assets/b.js が 500 を返した')
  })

  test('トップが 200 以外なら不合格', () => {
    const verdict = smokeVerdict(result({ documentStatus: 503, documentBytes: 0, assets: [] }))
    expect(verdict.ok).toBe(false)
  })

  /**
   * 資産が 1 本も無いのは「HTML は返るがビルド成果物が繋がっていない」状態。
   * 200 だけ見ていると見逃すので、ここで落とす。
   */
  test('資産が 1 本も無ければ不合格', () => {
    const verdict = smokeVerdict(result({ assets: [] }))
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reasons.join()).toContain('資産が 1 本も見つからない')
  })

  test('空の資産が返るのも不合格', () => {
    const verdict = smokeVerdict(
      result({ assets: [{ path: '/assets/a.js', status: 200, bytes: 0 }] }),
    )
    expect(verdict.ok).toBe(false)
  })
})

describe('describeSmokeResult', () => {
  test('落ちた資産が結果に出る', () => {
    const text = describeSmokeResult(
      result({ assets: [{ path: '/assets/b.js', status: 500, bytes: 0 }] }),
    )
    expect(text).toContain('/assets/b.js')
    expect(text).toContain('500')
  })
})

/**
 * `/ws/:documentId` は TanStack のルータより手前で `src/server.ts` が
 * 横取りする（ADR-0002）。デプロイでその配線が外れると、Upgrade 無しの
 * GET が 426 ではなく 200（ルータの 404 画面）を返すようになる。
 * トップと資産だけ見ていると気づけないので、ここで検査する。
 */
describe('smokeVerdict（WebSocket の入口）', () => {
  test('426 なら合格', () => {
    expect(smokeVerdict(result({ wsProbe: 426 }))).toEqual({ ok: true })
  })

  test('426 でなければ不合格', () => {
    const verdict = smokeVerdict(result({ wsProbe: 200 }))
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reasons.join()).toContain('426')
  })

  test('結果の表示に /ws/ の行が出る', () => {
    expect(describeSmokeResult(result({ wsProbe: 500 }))).toContain(WS_PROBE_PATH)
  })
})

describe('runSmoke', () => {
  const page = '<!DOCTYPE html><html><head><script src="/assets/a.js"></script></head></html>'

  const fetchLike = (seen: string[], wsStatus: number) => (url: string) => {
    seen.push(url)
    const status = new URL(url).pathname.startsWith('/ws/') ? wsStatus : 200
    return Promise.resolve({ status, text: () => Promise.resolve(status === 200 ? page : '') })
  }

  test('Upgrade を付けずに /ws/ を叩き、その状態コードを持ち帰る', async () => {
    const seen: string[] = []
    const smoke = await runSmoke('https://example.com/', fetchLike(seen, 426))
    expect(smoke.wsProbe).toBe(426)
    expect(seen).toContain(`https://example.com${WS_PROBE_PATH}`)
  })

  test('/ws/ が 426 以外でも例外にせず、結果として持ち帰る', async () => {
    const smoke = await runSmoke('https://example.com/', fetchLike([], 200))
    expect(smoke.wsProbe).toBe(200)
    expect(smokeVerdict(smoke).ok).toBe(false)
  })
})
