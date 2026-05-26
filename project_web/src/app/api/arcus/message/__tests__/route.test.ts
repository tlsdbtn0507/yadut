// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/auth/requireAllowedUser', () => ({
  requireAllowedUser: vi.fn(async () => ({
    ok: true,
    email: 'me@gmail.com',
  })),
}))

import { POST } from '../route'

describe('/api/arcus/message', () => {
  const originalEnv = process.env
  const originalFetch = global.fetch

  afterEach(() => {
    process.env = originalEnv
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('forwards an allowlisted request to the ThinkPad bridge with the server token', async () => {
    process.env = {
      ...originalEnv,
      THINKPAD_FUNNEL_URL: 'https://thinkpad.example.com',
      THINKPAD_BRIDGE_TOKEN: 'SERVER_TOKEN',
    }
    const fetchMock = vi.fn(async () =>
      Response.json({
        success: true,
        message: '안녕하세요',
      }),
    )
    global.fetch = fetchMock as typeof fetch

    const response = await POST(
      new Request('http://localhost/api/arcus/message', {
        method: 'POST',
        body: JSON.stringify({
          text: '안녕',
          attachment_type: null,
          attachment_data: null,
          attachment_name: 'upload.jpg',
          message_id: 'client-1',
        }),
      }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: '안녕하세요',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://thinkpad.example.com/api/arcus/message',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer SERVER_TOKEN',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: '안녕',
          attachment_type: null,
          attachment_data: null,
          attachment_name: 'upload.jpg',
          message_id: 'client-1',
        }),
      },
    )
  })
})
