import { describe, expect, test } from 'bun:test'
import { extractMermaidBlocks } from './mermaid-blocks.ts'

describe('extractMermaidBlocks', () => {
  test('mermaid ブロックが無いときは空配列', () => {
    expect(extractMermaidBlocks('# 見出し\n\n本文\n')).toEqual([])
  })

  test('3 行目から始まるブロックの開始行を 3 として返す', () => {
    const markdown = ['# 図', '', '```mermaid', 'graph TD;', '  A-->B;', '```', ''].join('\n')
    expect(extractMermaidBlocks(markdown)).toEqual([
      { index: 0, source: 'graph TD;\n  A-->B;', line: 3 },
    ])
  })

  test('複数のブロックに 0 から順に番号を振る', () => {
    const markdown = [
      '```mermaid',
      'graph TD;',
      '```',
      '',
      'あいだの文',
      '',
      '```mermaid',
      'sequenceDiagram',
      '```',
      '',
    ].join('\n')
    expect(extractMermaidBlocks(markdown)).toEqual([
      { index: 0, source: 'graph TD;', line: 1 },
      { index: 1, source: 'sequenceDiagram', line: 7 },
    ])
  })

  test('mermaid 以外のフェンスは拾わない', () => {
    const markdown = ['```ts', 'const a = 1', '```', ''].join('\n')
    expect(extractMermaidBlocks(markdown)).toEqual([])
  })

  test('情報文字列の前後の空白と大文字小文字を無視する', () => {
    const markdown = ['```  Mermaid  ', 'graph TD;', '```', ''].join('\n')
    expect(extractMermaidBlocks(markdown)).toHaveLength(1)
  })

  test('より長いフェンスの中にある ```mermaid は本文として扱う', () => {
    const markdown = ['````md', '```mermaid', 'graph TD;', '```', '````', ''].join('\n')
    expect(extractMermaidBlocks(markdown)).toEqual([])
  })

  test('4 本以上のバッククォートで囲んだ mermaid も拾う', () => {
    const markdown = ['````mermaid', 'graph TD;', '````', ''].join('\n')
    expect(extractMermaidBlocks(markdown)).toEqual([{ index: 0, source: 'graph TD;', line: 1 }])
  })

  test('閉じていないブロックは文末までをソースとして拾う', () => {
    const markdown = ['本文', '```mermaid', 'graph TD;', '  A-->B;'].join('\n')
    expect(extractMermaidBlocks(markdown)).toEqual([
      { index: 0, source: 'graph TD;\n  A-->B;', line: 2 },
    ])
  })

  test('CRLF の文書でも行番号がずれない', () => {
    const markdown = ['# 図', '', '```mermaid', 'graph TD;', '```'].join('\r\n')
    expect(extractMermaidBlocks(markdown)).toEqual([{ index: 0, source: 'graph TD;', line: 3 }])
  })

  test('空のブロックはソースが空文字列', () => {
    expect(extractMermaidBlocks('```mermaid\n```\n')).toEqual([{ index: 0, source: '', line: 1 }])
  })

  test('3 スペースまでのインデントは許す（4 スペースはコードブロック）', () => {
    expect(extractMermaidBlocks('   ```mermaid\n   graph TD;\n   ```\n')).toHaveLength(1)
    expect(extractMermaidBlocks('    ```mermaid\n    graph TD;\n    ```\n')).toHaveLength(0)
  })
})
