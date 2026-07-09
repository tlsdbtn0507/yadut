// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest'

import { issueNativeLoginCode } from '../nativeLoginCode'
import { authorizeNativeGoogleCredentials } from '../nativeCredentials'

describe('native Google credentials authorize', () => {
  const originalEnv = process.env

  afterEach(() => {
    process.env = originalEnv
  })

  it('returns an Auth.js user for a valid signed native code', async () => {
    process.env = {
      ...originalEnv,
      AUTH_SECRET: 'test-auth-secret',
    }
    const { code } = issueNativeLoginCode(
      {
        email: 'me@gmail.com',
        name: 'Arcus User',
        image: 'https://example.com/me.png',
      },
      1_000,
    )

    await expect(
      authorizeNativeGoogleCredentials({
        code,
      }, 1_001),
    ).resolves.toEqual({
      id: 'me@gmail.com',
      email: 'me@gmail.com',
      name: 'Arcus User',
      image: null,
    })
  })

  it('rejects missing and malformed native codes', async () => {
    await expect(authorizeNativeGoogleCredentials({})).resolves.toBeNull()
    await expect(
      authorizeNativeGoogleCredentials({
        code: 'unknown-code',
      }),
    ).resolves.toBeNull()
  })

  it('rejects tampered signed native codes', async () => {
    process.env = {
      ...originalEnv,
      AUTH_SECRET: 'test-auth-secret',
    }
    const { code } = issueNativeLoginCode(
      {
        email: 'me@gmail.com',
        name: null,
        image: null,
      },
      1_000,
    )
    const tamperedCode = `${code.slice(0, -1)}x`

    await expect(
      authorizeNativeGoogleCredentials({
        code: tamperedCode,
      }),
    ).resolves.toBeNull()
  })

  it('rejects expired signed native codes', async () => {
    process.env = {
      ...originalEnv,
      AUTH_SECRET: 'test-auth-secret',
    }
    const { code } = issueNativeLoginCode(
      {
        email: 'me@gmail.com',
        name: null,
        image: null,
      },
      1_000,
    )

    await expect(
      authorizeNativeGoogleCredentials({
        code,
      }, 1_000 + 181_000),
    ).resolves.toBeNull()
  })
})
