/**
 * `Actor` を server function の戻り値として運ぶための形。
 * 実装は `@rimltools/auth/contract`（qrcc / noter 共通、plan 001 段階 3）。
 * 検証できないものは visitor として扱う（安全側に倒す）。
 */
export type { ActorWire } from '@rimltools/auth/contract'
export { parseActorWire, toActorWire } from '@rimltools/auth/contract'
