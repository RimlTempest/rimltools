/**
 * infra/secrets の SOPS ファイルが平文でコミットされないようにする（ADR-0009）。
 * lefthook（pre-commit）と CI（security.yml）が同じ関数を使う。
 *
 * 秘密のファイルは「KEY: 値」が平らに並ぶだけの形に決めている（sops exec-env で環境変数にする）。
 * その前提で、sops のメタデータ以外の値がすべて ENC[AES256_GCM,...] であることを要求する。
 */
import type { Result } from './tools.ts'

const ENCRYPTED = /^ENC\[AES256_GCM,data:[^,]*,iv:[^,]+,tag:[^,]+,type:[a-z]+\]$/
const TOP_LEVEL = /^([A-Za-z_][A-Za-z0-9_]*):(?:\s+(.*))?$/

const fail = <T>(error: string): Result<T, string> => ({ ok: false, error })

/** 暗号化されている値の数を返す */
export const checkSopsEncrypted = (text: string): Result<number, string> => {
  const lines = text.split('\n')
  const metaStart = lines.findIndex((line) => line === 'sops:')
  if (metaStart < 0) return fail('no sops metadata (the file is not encrypted with sops)')

  const meta = lines.slice(metaStart + 1).join('\n')
  if (!/^\s+mac: ENC\[AES256_GCM,/m.test(meta)) return fail('sops metadata has no MAC')
  if (!/^\s+age:\n\s+- (?:enc|recipient):/m.test(meta))
    return fail('sops metadata has no age recipients')

  const problems: string[] = []
  let encrypted = 0
  for (const line of lines.slice(0, metaStart)) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue
    const match = TOP_LEVEL.exec(line)
    if (match === null) {
      problems.push(`unexpected line (files must be flat KEY: value): ${line.slice(0, 40)}`)
      continue
    }
    const [, key = '', value = ''] = match
    if (!ENCRYPTED.test(value.trim())) problems.push(`${key} is not encrypted`)
    else encrypted += 1
  }
  if (problems.length > 0) return fail(problems.join('\n'))
  if (encrypted === 0) return fail('no encrypted values')
  return { ok: true, value: encrypted }
}

const ALLOWED = [/\/[a-z]+\.sops\.yaml$/, /\/[a-z]+\.example\.yaml$/, /\/README\.md$/]

/**
 * infra/secrets に置いてよいのは暗号化済みの *.sops.yaml、値の空な *.example.yaml、README.md だけ。
 * 平文の apply.yaml や .env を置いてしまったらここで止める。検査した sops ファイルの数を返す。
 */
export const checkSecretsDirectory = (
  paths: readonly string[],
  read: (path: string) => string,
): Result<number, string> => {
  const problems: string[] = []
  let checked = 0
  for (const path of paths) {
    if (!ALLOWED.some((pattern) => pattern.test(path))) {
      problems.push(`${path}: only *.sops.yaml, *.example.yaml and README.md may live here`)
      continue
    }
    if (path.endsWith('.sops.yaml')) {
      const result = checkSopsEncrypted(read(path))
      if (!result.ok) problems.push(`${path}: ${result.error.replaceAll('\n', '; ')}`)
      checked += 1
    }
    if (path.endsWith('.example.yaml')) {
      const filled = read(path)
        .split('\n')
        .map((line) => TOP_LEVEL.exec(line))
        .filter((m) => m !== null && (m[2] ?? '').trim() !== '' && (m[2] ?? '').trim() !== '""')
      if (filled.length > 0)
        problems.push(`${path}: example files must leave every value empty ("")`)
    }
  }
  if (problems.length > 0) return fail(problems.join('\n'))
  return { ok: true, value: checked }
}
