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
    const appShellRule = getRule(css, '.appShell')

    expect(appShellRule).toContain('height: 100vh')
    expect(appShellRule).toContain('height: 100svh')
    expect(appShellRule!.indexOf('height: 100vh')).toBeLessThan(
      appShellRule!.indexOf('height: 100svh'),
    )
    expect(appShellRule).toContain('display: flex')
    expect(appShellRule).toContain('flex-direction: column')
    expect(appShellRule).toContain('overflow: hidden')
  })

  it('reserves iOS safe areas at the console shell boundary', () => {
    const css = readCss('src/app/page.module.css')
    const headerRule = getRule(css, '.header')
    const chatScreenRule = getRule(css, '.chatScreen')

    expect(headerRule).toContain('env(safe-area-inset-top, 0px)')
    expect(chatScreenRule).toContain('env(safe-area-inset-bottom, 0px)')
  })

  it('keeps only the message list scrollable inside the fixed shell', () => {
    const css = readCss('src/app/page.module.css')
    const messageFlowRule = getRule(css, '.messageFlow')

    expect(messageFlowRule).toContain('flex: 1')
    expect(messageFlowRule).toContain('min-height: 0')
    expect(messageFlowRule).toContain('overflow-y: auto')
  })

  it('sets viewport-fit cover so WKWebView can expose safe-area env values', () => {
    const layout = readCss('src/app/layout.tsx')

    expect(layout).toContain('viewportFit: "cover"')
  })
})
