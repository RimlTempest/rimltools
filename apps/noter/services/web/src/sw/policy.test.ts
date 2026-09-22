import { describe, expect, test } from 'bun:test'

import type { RequestFacts, Strategy } from '@rimltools/sw/handlers'

import { decide, PRECACHE } from './policy.ts'

const get = (pathname: string, extra: Partial<RequestFacts> = {}): RequestFacts => ({
  method: 'GET',
  pathname,
  sameOrigin: true,
  navigation: false,
  upgrade: false,
  ...extra,
})

// public/sw.js（TS 化する前）の挙動をそのまま表にしたもの（plan 007）
describe('noter service worker policy', () => {
  test.each<[string, RequestFacts, Strategy]>([
    ['GET 以外は触らない', get('/_serverFn/save', { method: 'POST' }), 'bypass'],
    ['WebSocket の切り替えは触らない', get('/anything', { upgrade: true }), 'bypass'],
    ['外部オリジンは触らない', get('/x.js', { sameOrigin: false }), 'bypass'],
    ['server function', get('/_serverFn/list'), 'bypass'],
    ['Durable Object への WebSocket', get('/ws/doc_1'), 'bypass'],
    ['認証', get('/api/auth/session'), 'bypass'],
    ['文書', get('/d/doc_1'), 'bypass'],
    ['共有リンクの入口', get('/s/token'), 'bypass'],
    ['HTML はキャッシュしない', get('/', { navigation: true }), 'bypass'],
    ['アセットは stale-while-revalidate', get('/assets/index-abc.js'), 'stale-while-revalidate'],
    ['アイコンも stale-while-revalidate', get('/icon.svg'), 'stale-while-revalidate'],
  ])('%s', (_label, facts, expected) => {
    expect(decide(facts)).toBe(expected)
  })

  test('precaches only the app icon (never HTML)', () => {
    expect(PRECACHE).toEqual(['/icon.svg'])
  })
})
