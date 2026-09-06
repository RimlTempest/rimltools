/**
 * 「変換して新規作成」の変換先（`docs/design/ux.md` §4.2 書き出し）。
 *
 * markdown は値を持たないので変換の対象にしない。種別が増えたときは
 * `DATA_DOCUMENT_KINDS` を足すだけで、ここは変えなくてよい。
 */
import type { DocumentKind } from '@noter/contract'
import type { DataDocumentKind } from '@noter/formats/contract'
import { DATA_DOCUMENT_KINDS, isDataDocumentKind } from '@noter/formats/contract'

export const convertTargets = (kind: DocumentKind): readonly DataDocumentKind[] =>
  isDataDocumentKind(kind) ? DATA_DOCUMENT_KINDS.filter((target) => target !== kind) : []
