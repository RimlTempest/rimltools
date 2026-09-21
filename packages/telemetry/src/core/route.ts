/**
 * span 名・ルートに使うパスの正規化。ID を含むパスのままだと系列（カーディナリティ）が
 * 爆発し、Grafana Cloud Free の 10k series をすぐ使い切る（docs/observability.md）。
 */

// 数字を含む 8 文字以上の英数字（ULID・UUID・prefix 付き ID など）
const ID = /^(?=.*\d)[A-Za-z0-9_-]{8,}$/
// ビルド成果物（ハッシュ付きファイル名）
const ASSET = /\.[a-z0-9]+$/

export const normalizePath = (path: string): string => {
  const segments = path.split('/')
  const last = segments.length - 1
  return segments
    .map((segment, index) => {
      if (segment === '') return segment
      if (index === last && ASSET.test(segment) && /\d/.test(segment)) return ':asset'
      return ID.test(segment) ? ':id' : segment
    })
    .join('/')
}
