// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest'

import {
  __resetNativeLoginCodes,
  issueNativeLoginCode,
} from '../nativeLoginCode'
import { authorizeNativeGoogleCredentials } from '../nativeCredentials'

describe('native Google credentials authorize', () => {
  afterEach(() => {
    __resetNativeLoginCodes()
  })

  it('returns an Auth.js user for a valid native one-time code', async () => {
    const { code } = issueNativeLoginCode({
      email: 'me@gmail.com',
      name: 'Arcus User',
      image: 'https://example.com/me.png',
    })

    await expect(
      authorizeNativeGoogleCredentials({
        code,
      }),
    ).resolves.toEqual({
      id: 'me@gmail.com',
      email: 'me@gmail.com',
      name: 'Arcus User',
      image: 'https://example.com/me.png',
    })
  })

  it('rejects missing and unknown native one-time codes', async () => {
    await expect(authorizeNativeGoogleCredentials({})).resolves.toBeNull()
    await expect(
      authorizeNativeGoogleCredentials({
        code: 'unknown-code',
      }),
    ).resolves.toBeNull()
  })

  it('consumes a native one-time code only once', async () => {
    const { code } = issueNativeLoginCode({
      email: 'me@gmail.com',
      name: null,
      image: null,
    })

    await expect(
      authorizeNativeGoogleCredentials({
        code,
      }),
    ).resolves.toEqual({
      id: 'me@gmail.com',
      email: 'me@gmail.com',
      name: 'me@gmail.com',
      image: null,
    })
    await expect(
      authorizeNativeGoogleCredentials({
        code,
      }),
    ).resolves.toBeNull()
  })
})
