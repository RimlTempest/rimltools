import type { RenderWarning } from '../contract/index.ts'

/** 警告を、次にどうすればよいかが分かる文にする。 */
export const describeWarning = (warning: RenderWarning): string => {
  switch (warning.kind) {
    case 'low_contrast':
      return `前景色と背景色のコントラスト比が ${warning.ratio.toFixed(1)}:1 で、読み取り機が失敗する可能性があります（${warning.minimum}:1 以上を推奨）。`
    case 'transparent_background':
      return '背景が透明です。貼り付け先の色によっては読み取れません。'
  }
}
