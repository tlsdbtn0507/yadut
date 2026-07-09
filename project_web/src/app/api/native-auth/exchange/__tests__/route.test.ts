// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'

import { POST } from '../route'

describe('/api/native-auth/exchange', () => {
  const originalEnv = process.env
  const originalFetch = global.fetch

  afterEach(() => {
    process.env = originalEnv
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('exchanges an allowlisted native Google idToken for a one-time login code', async () => {
    process.env = {
      ...originalEnv,
      AUTH_ALLOWED_EMAILS: 'me@gmail.com',
      AUTH_SECRET: 'test-auth-secret',
      GOOGLE_IOS_SERVER_CLIENT_ID: 'web-client-id.apps.googleusercontent.com',
    }
    global.fetch = vi.fn(async () =>
      Response.json({
        aud: 'web-client-id.apps.googleusercontent.com',
        email: 'ME@gmail.com',
        email_verified: 'true',
        name: 'Arcus User',
        picture: 'https://example.com/me.png',
      }),
    ) as typeof fetch

    const response = await POST(
      new Request('http://localhost/api/native-auth/exchange', {
        method: 'POST',
        body: JSON.stringify({
          idToken: 'native-google-id-token',
        }),
      }),
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({
      code: expect.any(String),
      expiresInSeconds: 180,
    })
    expect(body.code.split('.')).toHaveLength(2)
    expect(global.fetch).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/tokeninfo?id_token=native-google-id-token',
    )
  })

  it('rejects requests without an idToken', async () => {
    const response = await POST(
      new Request('http://localhost/api/native-auth/exchange', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'missing_id_token',
    })
  })

  it('rejects Google tokens issued for another audience', async () => {
    process.env = {
      ...originalEnv,
      AUTH_ALLOWED_EMAILS: 'me@gmail.com',
      AUTH_SECRET: 'test-auth-secret',
      GOOGLE_IOS_SERVER_CLIENT_ID: 'web-client-id.apps.googleusercontent.com',
    }
    global.fetch = vi.fn(async () =>
      Response.json({
        aud: 'other-client-id.apps.googleusercontent.com',
        email: 'me@gmail.com',
        email_verified: 'true',
      }),
    ) as typeof fetch

    const response = await POST(
      new Request('http://localhost/api/native-auth/exchange', {
        method: 'POST',
        body: JSON.stringify({
          idToken: 'wrong-audience-token',
        }),
      }),
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'invalid_google_token',
    })
  })

  it('rejects verified Google users outside the allowlist', async () => {
    process.env = {
      ...originalEnv,
      AUTH_ALLOWED_EMAILS: 'me@gmail.com',
      AUTH_SECRET: 'test-auth-secret',
      GOOGLE_IOS_SERVER_CLIENT_ID: 'web-client-id.apps.googleusercontent.com',
    }
    global.fetch = vi.fn(async () =>
      Response.json({
        aud: 'web-client-id.apps.googleusercontent.com',
        email: 'other@gmail.com',
        email_verified: 'true',
      }),
    ) as typeof fetch

    const response = await POST(
      new Request('http://localhost/api/native-auth/exchange', {
        method: 'POST',
        body: JSON.stringify({
          idToken: 'unlisted-user-token',
        }),
      }),
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'forbidden',
    })
  })
})
