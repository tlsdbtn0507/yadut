// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { shouldSubmitChatKey } from '../chatKeyboard'

describe('shouldSubmitChatKey', () => {
  it('submits plain Enter', () => {
    expect(
      shouldSubmitChatKey({
        key: 'Enter',
        shiftKey: false,
        isComposing: false,
        keyCode: 13,
      }),
    ).toBe(true)
  })

  it('does not submit Shift+Enter', () => {
    expect(
      shouldSubmitChatKey({
        key: 'Enter',
        shiftKey: true,
        isComposing: false,
        keyCode: 13,
      }),
    ).toBe(false)
  })

  it('does not submit while an IME composition is active', () => {
    expect(
      shouldSubmitChatKey({
        key: 'Enter',
        shiftKey: false,
        isComposing: true,
        keyCode: 13,
      }),
    ).toBe(false)
  })

  it('does not submit Safari-style IME keydown events', () => {
    expect(
      shouldSubmitChatKey({
        key: 'Enter',
        shiftKey: false,
        isComposing: false,
        keyCode: 229,
      }),
    ).toBe(false)
  })
})
