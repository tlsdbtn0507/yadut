'use client'

import { type CSSProperties, useEffect, useState } from 'react'

type ViewportStyle = CSSProperties & {
  '--app-height': string
  '--app-offset-top': string
  '--app-bottom-inset': string
}

const DEFAULT_STYLE: ViewportStyle = {
  '--app-height': '100svh',
  '--app-offset-top': '0px',
  '--app-bottom-inset': 'env(safe-area-inset-bottom, 0px)',
}

function readViewportStyle(): ViewportStyle {
  const viewport = window.visualViewport
  const keyboardInset = viewport
    ? window.innerHeight - viewport.height - viewport.offsetTop
    : 0
  return {
    '--app-height': `${Math.round(viewport?.height ?? window.innerHeight)}px`,
    '--app-offset-top': `${Math.round(viewport?.offsetTop ?? 0)}px`,
    '--app-bottom-inset': keyboardInset > 120
      ? '0px'
      : 'env(safe-area-inset-bottom, 0px)',
  }
}

export function useVisualViewportHeight(): CSSProperties {
  const [style, setStyle] = useState<ViewportStyle>(DEFAULT_STYLE)

  useEffect(() => {
    const viewport = window.visualViewport
    const update = () => setStyle(readViewportStyle())
    update()
    viewport?.addEventListener('resize', update)
    viewport?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => {
      viewport?.removeEventListener('resize', update)
      viewport?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  return style
}
