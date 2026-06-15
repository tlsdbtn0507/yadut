// @vitest-environment node

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function readCss(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

function getRule(css: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return css.match(new RegExp(`${escapedSelector}\\s*\\{(?<body>[^}]+)\\}`))?.groups?.body
}

describe('mobile viewport stability', () => {
  it('keeps the command textarea font size at least 16px for iOS Safari', () => {
    const css = readCss('src/app/page.module.css')
    const textFieldRule = getRule(css, '.textField')

    expect(textFieldRule).toBeDefined()

    const fontSize = textFieldRule?.match(/font-size:\s*(?<size>\d+)px/)

    expect(Number(fontSize?.groups?.size)).toBeGreaterThanOrEqual(16)
  })

  it('uses small viewport height fallback order for the fixed app shell', () => {
    const css = readCss('src/app/page.module.css')
    const chatContainerRule = getRule(css, '.chatContainer')

    expect(chatContainerRule).toContain('height: 100vh')
    expect(chatContainerRule).toContain('height: 100svh')
    expect(chatContainerRule!.indexOf('height: 100vh')).toBeLessThan(
      chatContainerRule!.indexOf('height: 100svh'),
    )
    expect(chatContainerRule).toContain('display: flex')
    expect(chatContainerRule).toContain('flex-direction: column')
    expect(chatContainerRule).toContain('overflow: hidden')
  })

  it('reserves iOS safe areas at the console shell boundary', () => {
    const css = readCss('src/app/page.module.css')
    const chatContainerRule = getRule(css, '.chatContainer')

    expect(chatContainerRule).toContain('padding-top: env(safe-area-inset-top, 0px)')
    expect(chatContainerRule).toContain('padding-bottom: env(safe-area-inset-bottom, 0px)')
  })

  it('keeps only the message list scrollable inside the fixed shell', () => {
    const css = readCss('src/app/page.module.css')
    const chatFlowRule = getRule(css, '.chatFlow')

    expect(chatFlowRule).toContain('flex: 1 1 auto')
    expect(chatFlowRule).toContain('min-height: 0')
    expect(chatFlowRule).toContain('overflow-y: auto')
  })

  it('sets viewport-fit cover so WKWebView can expose safe-area env values', () => {
    const layout = readCss('src/app/layout.tsx')

    expect(layout).toContain('viewportFit: "cover"')
  })
})
