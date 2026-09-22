import { describe, expect, test } from 'bun:test'

import { checkSecretsDirectory, checkSopsEncrypted } from './sops-guard.ts'

// 使い捨ての age 鍵で sops 3.13.3 が実際に暗号化したファイル（秘密鍵は生成直後に破棄済み）
const encrypted = await Bun.file(new URL('./fixtures/sops-encrypted.yaml', import.meta.url)).text()

describe('checkSopsEncrypted', () => {
  test('accepts a file that sops encrypted', () => {
    expect(checkSopsEncrypted(encrypted)).toEqual({ ok: true, value: 3 })
  })

  test('does not depend on the indentation of the sops metadata', () => {
    const reindented = encrypted.replace(/^( +)/gm, (spaces) => spaces.slice(spaces.length / 2))
    expect(checkSopsEncrypted(reindented)).toEqual({ ok: true, value: 3 })
  })

  test('rejects a plaintext file', () => {
    const result = checkSopsEncrypted('TF_VAR_github_token: github_pat_xxx\n')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('no sops metadata')
  })

  test('rejects a value added in plaintext after encryption', () => {
    const tampered = encrypted.replace(
      'sops:\n',
      'TF_VAR_cloudflare_api_token: cf-plain-token\nsops:\n',
    )
    const result = checkSopsEncrypted(tampered)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('TF_VAR_cloudflare_api_token')
  })

  test('rejects keys that sops leaves unencrypted by suffix', () => {
    const tampered = encrypted.replace('sops:\n', 'TOKEN_unencrypted: plain\nsops:\n')
    expect(checkSopsEncrypted(tampered).ok).toBe(false)
  })

  test('rejects metadata without a MAC or without age recipients', () => {
    expect(checkSopsEncrypted(encrypted.replace(/ {4}mac: .*\n/, '')).ok).toBe(false)
    expect(
      checkSopsEncrypted(encrypted.replace(/ {4}age:\n(?: {8}.*\n| {10}.*\n| {12}.*\n)+/, '')).ok,
    ).toBe(false)
  })

  test('rejects nested maps (the secrets files are flat KEY: value)', () => {
    const nested = encrypted.replace(
      'sops:\n',
      'nested:\n  inner: ENC[AES256_GCM,data:x,iv:y,tag:z,type:str]\nsops:\n',
    )
    expect(checkSopsEncrypted(nested).ok).toBe(false)
  })
})

const read = (files: Record<string, string>) => (path: string) => files[path] ?? ''

describe('checkSecretsDirectory', () => {
  test('allows only *.sops.yaml, *.example.yaml and README.md', () => {
    const files = {
      'infra/secrets/apply.sops.yaml': encrypted,
      'infra/secrets/apply.example.yaml': 'TF_VAR_github_token: ""\n',
      'infra/secrets/README.md': '# secrets',
    }
    expect(checkSecretsDirectory(Object.keys(files), read(files))).toEqual({ ok: true, value: 1 })
  })

  test('rejects a stray plaintext file such as apply.yaml or .env', () => {
    for (const name of [
      'infra/secrets/apply.yaml',
      'infra/secrets/.env',
      'infra/secrets/plan.sops.yml',
    ]) {
      const result = checkSecretsDirectory([name], read({ [name]: 'X: y\n' }))
      expect(result.ok).toBe(false)
    }
  })

  test('rejects example files that contain values', () => {
    const files = { 'infra/secrets/plan.example.yaml': 'TF_VAR_github_token: github_pat_real\n' }
    const result = checkSecretsDirectory(Object.keys(files), read(files))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('example')
  })

  test('reports every sops file that is not encrypted', () => {
    const files = { 'infra/secrets/plan.sops.yaml': 'A: b\n' }
    const result = checkSecretsDirectory(Object.keys(files), read(files))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('plan.sops.yaml')
  })
})
