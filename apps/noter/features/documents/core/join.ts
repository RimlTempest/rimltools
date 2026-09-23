/**
 * 共有リンクで入ってきた人の役割を決める（ADR-0011）。
 *
 * **既存メンバーの権限を下げない。** viewer リンクを踏んだ editor が
 * viewer に落ちると、リンクを配るたびに権限が壊れる。
 */
import { higherRole } from '@noter/contract'
import type { Role } from '@noter/contract'
import type { ShareRole } from '@noter/auth/contract'

export const resolveJoinedRole = (existing: Role | undefined, linkRole: ShareRole): Role =>
  existing === undefined ? linkRole : higherRole(existing, linkRole)
