/**
 * TS(`@qrcc/contract`) と Rust(`qrcc-kernel`) が同じ判定をすることを、
 * `shared/kernel/fixtures/` の同じ JSON で検証する。
 *
 * Rust 側の対になるテストは `shared/kernel/engine/tests/conformance.rs`。
 * どちらか一方だけを直すとこのテストが落ちる。
 */
import { describe, expect, test } from 'bun:test'
import {
  encodeCrockfordBase32,
  parseCodeId,
  parseEmailAddress,
  parseFolderId,
  parseHexColor,
  parseHttpUrl,
  parseNonEmptyText,
  parsePhoneNumber,
  parseShareToken,
  parseSpecHash,
  parseUserId,
  decodeCommonRpcError,
} from '@qrcc/contract'

import base32Fixture from '../fixtures/base32.json' with { type: 'json' }
import idsFixture from '../fixtures/ids.json' with { type: 'json' }
import rpcErrorsFixture from '../fixtures/rpc-errors.json' with { type: 'json' }
import textFixture from '../fixtures/text.json' with { type: 'json' }

const idParsers: Record<string, (value: string) => { readonly ok: boolean }> = {
  user: parseUserId,
  code: parseCodeId,
  folder: parseFolderId,
  share_token: parseShareToken,
  spec_hash: parseSpecHash,
}

const textParsers: Record<string, (value: string) => { readonly ok: boolean }> = {
  non_empty_text: parseNonEmptyText,
  http_url: parseHttpUrl,
  email: parseEmailAddress,
  phone: parsePhoneNumber,
  hex_color: parseHexColor,
}

const parserFor = (
  parsers: Record<string, (value: string) => { readonly ok: boolean }>,
  kind: string,
) => {
  const parser = parsers[kind]
  if (parser === undefined) throw new Error(`unknown kind in fixture: ${kind}`)
  return parser
}

describe('Crockford base32 の適合', () => {
  for (const vector of base32Fixture.vectors) {
    test(`[${vector.bytes.join(',')}] -> ${vector.encoded || '(空)'}`, () => {
      expect(encodeCrockfordBase32(new Uint8Array(vector.bytes))).toBe(vector.encoded)
    })
  }
})

describe('ID の適合', () => {
  for (const testCase of idsFixture.cases) {
    test(`${testCase.kind}: ${JSON.stringify(testCase.value)} は ${testCase.valid ? '有効' : '無効'}`, () => {
      expect(parserFor(idParsers, testCase.kind)(testCase.value).ok).toBe(testCase.valid)
    })
  }
})

describe('検証済み文字列の適合', () => {
  for (const testCase of textFixture.cases) {
    test(`${testCase.kind}: ${JSON.stringify(testCase.value)} は ${testCase.valid ? '有効' : '無効'}`, () => {
      expect(parserFor(textParsers, testCase.kind)(testCase.value).ok).toBe(testCase.valid)
    })
  }
})

describe('RPC 共通エラーの適合', () => {
  for (const testCase of rpcErrorsFixture.cases) {
    test(`${JSON.stringify(testCase.json)} は ${testCase.valid ? '読める' : '読めない'}`, () => {
      expect(decodeCommonRpcError(testCase.json).ok).toBe(testCase.valid)
    })
  }
})
