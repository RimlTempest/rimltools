import { describe, expect, test } from 'bun:test'
import type { NfcWriteError } from '../contract/index.ts'
import { describeNfcError } from './describe-error.ts'

/** 「次に何をすればよいか」まで書かれているかを、行動を促す言い回しの有無で確かめる。 */
const hasNextStep = (message: string): boolean => /(ください|お試し|しましょう)/.test(message)

const ERRORS: readonly NfcWriteError[] = [
  { kind: 'unsupported' },
  { kind: 'permission_denied' },
  { kind: 'no_tag' },
  { kind: 'write_failed', detail: 'NotSupportedError' },
]

describe('describeNfcError', () => {
  for (const error of ERRORS) {
    test(`${error.kind}: 次の行動まで書かれている`, () => {
      const message = describeNfcError(error)
      expect(message.length).toBeGreaterThan(0)
      expect(hasNextStep(message)).toBe(true)
    })
  }

  test('write_failed は detail を含める', () => {
    expect(describeNfcError({ kind: 'write_failed', detail: 'NotSupportedError' })).toContain(
      'NotSupportedError',
    )
  })

  test('unsupported は Android の Chrome が必要であることを伝える', () => {
    expect(describeNfcError({ kind: 'unsupported' })).toContain('Android')
  })
})
