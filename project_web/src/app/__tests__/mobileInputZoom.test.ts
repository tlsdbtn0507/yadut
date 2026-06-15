// @vitest-environment node

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('mobile input zoom prevention', () => {
  it('keeps the command textarea font size at least 16px for iOS Safari', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/page.module.css'), 'utf8')
    const textFieldRule = css.match(/\.textField\s*\{(?<body>[^}]+)\}/)

    expect(textFieldRule?.groups?.body).toBeDefined()

    const fontSize = textFieldRule?.groups?.body.match(/font-size:\s*(?<size>\d+)px/)

    expect(Number(fontSize?.groups?.size)).toBeGreaterThanOrEqual(16)
  })
})
