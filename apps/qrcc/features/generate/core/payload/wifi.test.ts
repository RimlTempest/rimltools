import { describe, expect, test } from 'bun:test'
import { buildWifiPayload } from './wifi.ts'

describe('buildWifiPayload', () => {
  test('SSID とパスワードから WPA として組み立てる', () => {
    const result = buildWifiPayload({ ssid: 'my-network', password: 'sw0rdfish', hidden: false })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.kind).toBe('wifi')
    expect(result.value.auth).toEqual({ kind: 'wpa', password: 'sw0rdfish' })
    expect(result.value.hidden).toBe(false)
  })

  test('パスワードが空なら認証なし（nopass）にする', () => {
    const result = buildWifiPayload({ ssid: 'my-network', password: '', hidden: false })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.auth).toEqual({ kind: 'nopass' })
  })

  test('hidden をそのまま伝える', () => {
    const result = buildWifiPayload({ ssid: 'my-network', password: '', hidden: true })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.hidden).toBe(true)
  })

  test('SSID が空なら失敗する', () => {
    const result = buildWifiPayload({ ssid: '', password: '', hidden: false })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('invalid_ssid')
  })
})
