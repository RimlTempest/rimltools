import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

const resetCss = readFileSync(new URL('./reset.css', import.meta.url), 'utf8')

describe('@rimltools/ui/reset.css', () => {
  test('ブラウザ差を潰すのは riml-ds の reset に任せる', () => {
    expect(resetCss).toContain("@import '@rimltempest/riml-ds-css/reset.css';")
    // 自前の box-sizing / margin の指定は二重に持たない
    expect(resetCss).not.toMatch(/box-sizing/)
  })

  test('class を付けたリストの行頭記号は消す（riml-ds の reset に無い分の補い）', () => {
    expect(resetCss).toContain(':where(ul, ol):where([class])')
    expect(resetCss).toContain('list-style: none')
  })

  test('riml-ds の reset に import 資格（npm の依存）がある', () => {
    Bun.resolveSync('@rimltempest/riml-ds-css/reset.css', import.meta.dir)
  })
})
