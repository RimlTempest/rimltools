import { describe, expect, test } from 'bun:test'
import { ok } from '@qrcc/contract'
import type { CanvasDeps } from './download.ts'
import {
  buildFileName,
  describeDownloadError,
  elementToPng,
  svgToBlob,
  svgToPng,
} from './download.ts'

const pngBlob = () => new Blob(['png'], { type: 'image/png' })

const fakeDeps = (over: Partial<CanvasDeps> = {}) => {
  const created: string[] = []
  const revoked: string[] = []
  const deps: CanvasDeps = {
    rasterizeUrl: async () => ok(pngBlob()),
    rasterizeElement: async () => ok(pngBlob()),
    createObjectUrl: () => {
      const url = `blob:${created.length}`
      created.push(url)
      return url
    },
    revokeObjectUrl: (url) => {
      revoked.push(url)
    },
    ...over,
  }
  return { deps, created, revoked }
}

describe('ファイル名', () => {
  test('内容から作るので、複数保存しても見分けが付く', () => {
    expect(buildFileName('URL: https://example.com', 'png')).toBe('URL-httpsexample.com.png')
  })

  test('パスに見える文字を落とす', () => {
    expect(buildFileName('../../etc/passwd', 'svg')).toBe('....etcpasswd.svg')
  })

  test('空になったら既定名にする', () => {
    expect(buildFileName('   ', 'png')).toBe('qrcc-code.png')
    expect(buildFileName('///', 'png')).toBe('qrcc-code.png')
  })

  test('長すぎる名前は切り詰める', () => {
    expect(buildFileName('あ'.repeat(200), 'png').length).toBeLessThanOrEqual(64)
  })
})

describe('SVG の保存', () => {
  test('MIME 型を付けて Blob にする', () => {
    expect(svgToBlob('<svg/>').type).toBe('image/svg+xml;charset=utf-8')
  })
})

describe('PNG への変換', () => {
  test('ラスタ化の結果をそのまま返す', async () => {
    const { deps } = fakeDeps()
    const result = await svgToPng('<svg/>', { width: 10, height: 10 }, deps)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.type).toBe('image/png')
  })

  test('SVG の一時 URL をラスタ化に渡す', async () => {
    const seen: string[] = []
    const { deps } = fakeDeps({
      rasterizeUrl: async (url) => {
        seen.push(url)
        return ok(pngBlob())
      },
    })
    await svgToPng('<svg/>', { width: 10, height: 10 }, deps)
    expect(seen).toEqual(['blob:0'])
  })

  /** 解放しないと、生成のたびにメモリが積み上がる。 */
  test('成功しても失敗しても一時 URL を解放する', async () => {
    const success = fakeDeps()
    await svgToPng('<svg/>', { width: 10, height: 10 }, success.deps)
    expect(success.revoked).toEqual(success.created)

    const failure = fakeDeps({
      rasterizeUrl: async () => ({ ok: false, error: { kind: 'decode_failed', detail: 'x' } }),
    })
    await svgToPng('<svg/>', { width: 10, height: 10 }, failure.deps)
    expect(failure.revoked).toEqual(failure.created)
  })

  test('ラスタ化の失敗をそのまま伝える', async () => {
    const { deps } = fakeDeps({
      rasterizeUrl: async () => ({ ok: false, error: { kind: 'decode_failed', detail: 'x' } }),
    })
    const result = await svgToPng('<svg/>', { width: 10, height: 10 }, deps)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe('decode_failed')
  })
})

describe('HTML in Canvas（段階的強化）', () => {
  test('使えない環境では例外ではなく unsupported を返す', async () => {
    const { deps } = fakeDeps({
      rasterizeElement: async () => ({
        ok: false,
        error: { kind: 'unsupported', detail: 'drawElementImage is not available' },
      }),
    })
    const result = await elementToPng({}, { width: 10, height: 10 }, deps)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe('unsupported')
  })

  test('使える環境では要素まるごとを PNG にする', async () => {
    const { deps } = fakeDeps()
    const result = await elementToPng({}, { width: 10, height: 10 }, deps)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.type).toBe('image/png')
  })
})

describe('エラー文言', () => {
  test('すべての種類に、次にどうすればよいかが書いてある', () => {
    for (const kind of ['decode_failed', 'encode_failed', 'unsupported'] as const) {
      expect(describeDownloadError({ kind, detail: 'x' }).length).toBeGreaterThan(10)
    }
  })
})
