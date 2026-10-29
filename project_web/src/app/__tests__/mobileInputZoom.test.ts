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

  it('sizes and positions the app shell from visual viewport variables', () => {
    const css = readCss('src/app/page.module.css')
    const appShellRule = getRule(css, '.appShell')

    expect(appShellRule).toContain('height: var(--app-height, 100svh)')
    expect(appShellRule).toContain('top: var(--app-offset-top, 0px)')
    expect(appShellRule).toContain('position: fixed')
    expect(appShellRule).toContain('display: flex')
    expect(appShellRule).toContain('flex-direction: column')
    expect(appShellRule).toContain('overflow: hidden')
  })

  it('reserves iOS safe areas at the console shell boundary', () => {
    const css = readCss('src/app/page.module.css')
    const headerRule = getRule(css, '.header')
    const chatScreenRule = getRule(css, '.chatScreen')

    expect(headerRule).toContain('env(safe-area-inset-top, 0px)')
    expect(chatScreenRule).toContain('var(--app-bottom-inset')
  })

  it('keeps only the message list scrollable inside the fixed shell', () => {
    const css = readCss('src/app/page.module.css')
    const messageFlowRule = getRule(css, '.messageFlow')

    expect(messageFlowRule).toContain('flex: 1')
    expect(messageFlowRule).toContain('min-height: 0')
    expect(messageFlowRule).toContain('overflow-y: auto')
  })

  it('keeps staged attachments in the composer layout flow', () => {
    const css = readCss('src/app/page.module.css')
    const composerRule = getRule(css, '.composer')
    const stagedBarRule = getRule(css, '.stagedBar')

    expect(composerRule).toContain('flex-wrap: wrap')
    expect(stagedBarRule).toContain('position: static')
    expect(stagedBarRule).toContain('flex-basis: 100%')
  })

  it('sets viewport-fit cover so WKWebView can expose safe-area env values', () => {
    const layout = readCss('src/app/layout.tsx')

    expect(layout).toContain('viewportFit: "cover"')
  })
})
