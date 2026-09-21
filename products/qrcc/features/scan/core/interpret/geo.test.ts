import { describe, expect, test } from 'bun:test'
import { interpretGeo } from './geo.ts'

describe('interpretGeo', () => {
  test('緯度経度を取り出す', () => {
    expect(interpretGeo('geo:35.681236,139.767125')).toEqual({
      kind: 'geo',
      lat: 35.681236,
      lon: 139.767125,
    })
  })

  test('高度やパラメータが付いても緯度経度だけ取り出す', () => {
    expect(interpretGeo('geo:35.681236,139.767125,15;u=20')).toEqual({
      kind: 'geo',
      lat: 35.681236,
      lon: 139.767125,
    })
  })

  test('負の値も扱える', () => {
    expect(interpretGeo('geo:-33.8688,151.2093')).toEqual({
      kind: 'geo',
      lat: -33.8688,
      lon: 151.2093,
    })
  })

  test('geo: で始まらなければ何も返さない', () => {
    expect(interpretGeo('35.681236,139.767125')).toBeUndefined()
  })

  /** 壊れた入力: 経度が無い */
  test('区切りが無く経度が無ければ何も返さない', () => {
    expect(interpretGeo('geo:35.681236')).toBeUndefined()
  })

  /** 壊れた入力: 値が空 */
  test('緯度が空なら何も返さない', () => {
    expect(interpretGeo('geo:,139.767125')).toBeUndefined()
  })

  /** 壊れた入力: 数値でない */
  test('数値でなければ何も返さない', () => {
    expect(interpretGeo('geo:abc,def')).toBeUndefined()
  })
})
