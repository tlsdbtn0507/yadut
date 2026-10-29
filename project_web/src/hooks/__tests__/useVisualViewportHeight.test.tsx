import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { useVisualViewportHeight } from '../useVisualViewportHeight'

type MutableViewport = EventTarget & {
  height: number
  offsetTop: number
}

const originalViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport')
const originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight')

function installViewport(height: number, offsetTop: number): MutableViewport {
  const viewport = Object.assign(new EventTarget(), { height, offsetTop })
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport })
  return viewport
}

afterEach(() => {
  if (originalViewport) Object.defineProperty(window, 'visualViewport', originalViewport)
  else Reflect.deleteProperty(window, 'visualViewport')
  if (originalInnerHeight) Object.defineProperty(window, 'innerHeight', originalInnerHeight)
})

describe('useVisualViewportHeight', () => {
  it('returns the current visual viewport dimensions', () => {
    installViewport(512, 18)

    const { result } = renderHook(() => useVisualViewportHeight())

    expect(result.current).toMatchObject({
      '--app-height': '512px',
      '--app-offset-top': '18px',
      '--app-bottom-inset': '0px',
    })
  })

  it.each(['resize', 'scroll'])('updates after visual viewport %s', (eventName) => {
    const viewport = installViewport(512, 18)
    const { result } = renderHook(() => useVisualViewportHeight())

    act(() => {
      viewport.height = 760
      viewport.offsetTop = 0
      viewport.dispatchEvent(new Event(eventName))
    })

    expect(result.current).toMatchObject({
      '--app-height': '760px',
      '--app-offset-top': '0px',
      '--app-bottom-inset': 'env(safe-area-inset-bottom, 0px)',
    })
  })

  it('falls back to the window height when visualViewport is unavailable', () => {
    Reflect.deleteProperty(window, 'visualViewport')
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 })

    const { result } = renderHook(() => useVisualViewportHeight())

    expect(result.current).toMatchObject({
      '--app-height': '844px',
      '--app-offset-top': '0px',
      '--app-bottom-inset': 'env(safe-area-inset-bottom, 0px)',
    })
  })
})
