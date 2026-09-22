import { describe, expect, test } from 'bun:test'
import { interpretWifi } from './wifi.ts'

describe('interpretWifi', () => {
  test('SSID・暗号方式・パスワードを取り出す', () => {
    expect(interpretWifi('WIFI:S:MyNet;T:WPA;P:secret;;')).toEqual({
      kind: 'wifi',
      ssid: 'MyNet',
      auth: 'WPA',
      password: 'secret',
    })
  })

  test('大文字小文字を問わない', () => {
    expect(interpretWifi('wifi:S:MyNet;T:WPA;P:secret;;')).toEqual({
      kind: 'wifi',
      ssid: 'MyNet',
      auth: 'WPA',
      password: 'secret',
    })
  })

  test('エスケープされた ; や : を含む SSID を戻せる', () => {
    expect(interpretWifi('WIFI:S:My\\;Net;T:WPA;P:se\\:cret;;')).toEqual({
      kind: 'wifi',
      ssid: 'My;Net',
      auth: 'WPA',
      password: 'se:cret',
    })
  })

  test('パスワードが無い（オープンな）ネットワークも扱える', () => {
    expect(interpretWifi('WIFI:S:FreeWifi;T:nopass;;')).toEqual({
      kind: 'wifi',
      ssid: 'FreeWifi',
      auth: 'nopass',
      password: undefined,
    })
  })

  test('WIFI: で始まらなければ何も返さない', () => {
    expect(interpretWifi('S:MyNet;T:WPA;P:secret;;')).toBeUndefined()
  })

  /** 壊れた入力: 途中で切れている（末尾の ;; が無い） */
  test('末尾の ;; が無くても読める', () => {
    expect(interpretWifi('WIFI:S:MyNet;T:WPA;P:secret')).toEqual({
      kind: 'wifi',
      ssid: 'MyNet',
      auth: 'WPA',
      password: 'secret',
    })
  })

  /** 壊れた入力: 区切りが無い */
  test('区切りが無ければ空の SSID として扱い、例外を投げない', () => {
    expect(interpretWifi('WIFI:SMyNetTWPAPsecret')).toEqual({
      kind: 'wifi',
      ssid: '',
      auth: 'nopass',
      password: undefined,
    })
  })

  /** 壊れた入力: 値が空 */
  test('SSID が空でも例外を投げない', () => {
    expect(interpretWifi('WIFI:S:;T:WPA;P:secret;;')).toEqual({
      kind: 'wifi',
      ssid: '',
      auth: 'WPA',
      password: 'secret',
    })
  })
})
