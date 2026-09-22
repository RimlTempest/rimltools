import { describe, expect, test } from 'bun:test'

import type { RequestFacts, Strategy } from '@rimltools/sw/handlers'

import { decide } from './policy.ts'

const get = (pathname: string, extra: Partial<RequestFacts> = {}): RequestFacts => ({
  method: 'GET',
  pathname,
  sameOrigin: true,
  navigation: false,
  upgrade: false,
  ...extra,
})
const page = (pathname: string) => get(pathname, { navigation: true })

// public/sw.js（TS 化する前）の挙動をそのまま表にしたもの（plans/009-pwa.md）
describe('qrcc service worker policy', () => {
  test.each<[string, RequestFacts, Strategy]>([
    ['POST は触らない', get('/_serverFn/save', { method: 'POST' }), 'bypass'],
    ['外部オリジンは触らない', get('/assets/a.js', { sameOrigin: false }), 'bypass'],
    ['server function はキャッシュしない', get('/_serverFn/list'), 'bypass'],
    ['認証はキャッシュしない', get('/api/auth/session'), 'bypass'],
    ['内容ハッシュ付きのアセットは cache-first', get('/assets/index-abc.js'), 'cache-first'],
    ['公開ページは network-first で保存する', page('/'), 'network-first'],
    ['公開ページ: /print', page('/print'), 'network-first'],
    ['公開ページ: /settings', page('/settings'), 'network-first'],
    ['公開ページ: /sign-in', page('/sign-in'), 'network-first'],
    ['公開ページ: /nfc', page('/nfc'), 'network-first'],
    ['認証が要るページは保存しない', page('/codes'), 'network-only'],
    ['認証が要るページ: /codes/*', page('/codes/abc'), 'network-only'],
    ['共有ページも保存しない', page('/shared/xyz'), 'network-only'],
    ['それ以外は素通し', get('/icon.svg'), 'bypass'],
  ])('%s', (_label, facts, expected) => {
    expect(decide(facts)).toBe(expected)
  })
})
