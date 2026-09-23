import { afterEach, expect, test } from 'bun:test'
import { cleanup, render } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'

import { HYDRATED_ATTRIBUTE, HydrationMarker } from './hydration-marker.tsx'

afterEach(() => {
  cleanup()
  document.documentElement.removeAttribute(HYDRATED_ATTRIBUTE)
})

test('サーバの HTML には目印を出さない（React がつながる前は未完了）', () => {
  expect(renderToStaticMarkup(<HydrationMarker />)).toBe('')
})

test('React がつながったら <html> に目印を立てる', () => {
  expect(document.documentElement.hasAttribute(HYDRATED_ATTRIBUTE)).toBe(false)
  render(<HydrationMarker />)
  expect(document.documentElement.getAttribute(HYDRATED_ATTRIBUTE)).toBe('true')
})
