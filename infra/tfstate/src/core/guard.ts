import { err, ok, type Result } from '@rimltools/contract'

export type StateMeta = { serial: number; lineage: string }

// 平文の state にだけ現れるキー。暗号化された state は encrypted_data の中に隠れている
const PLAINTEXT_KEYS = ['resources', 'outputs', 'terraform_version', 'check_results']

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * OpenTofu のネイティブ暗号化（encryption_version + encrypted_data）で暗号化された state だけを通す。
 * Worker は暗号文を保存するだけで復号はしない。平文の state を誤って送ってきた場合に、
 * 保存する前に止めるための多重防御（encryption.state.enforced の取りこぼし対策）。
 */
export const checkEncryptedState = (body: string): Result<StateMeta, string> => {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return err('state is not JSON')
  }
  if (!isRecord(parsed)) return err('state is not a JSON object')
  const { encrypted_data: data, encryption_version: version, serial, lineage } = parsed
  if (typeof data !== 'string' || typeof version !== 'string' || data.length === 0) {
    return err('state is not encrypted (encrypted_data / encryption_version missing)')
  }
  const leaked = PLAINTEXT_KEYS.filter((key) => key in parsed)
  if (leaked.length > 0) return err(`state is not encrypted (plaintext keys: ${leaked.join(', ')})`)
  if (typeof serial !== 'number' || !Number.isInteger(serial) || serial < 0) {
    return err('state has no valid serial')
  }
  if (typeof lineage !== 'string') return err('state has no lineage')
  return ok({ serial, lineage })
}
