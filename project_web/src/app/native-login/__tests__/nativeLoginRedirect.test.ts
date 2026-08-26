// @vitest-environment node

import { describe, expect, it } from 'vitest'

import {
  buildNativeLoginCallbackUrl,
  getNativeLoginConsolePath,
} from '../nativeLoginRedirect'

describe('native login redirect helpers', () => {
  it('pins the Auth.js callback URL to the current WebView origin', () => {
    expect(buildNativeLoginCallbackUrl('http://127.0.0.1:3000')).toBe(
      'http://127.0.0.1:3000/',
    )
  })

  it('redirects within the current origin after the session is created', () => {
    expect(getNativeLoginConsolePath()).toBe('/')
  })
})
