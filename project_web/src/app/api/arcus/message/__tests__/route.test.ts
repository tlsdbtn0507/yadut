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

  it('verifies the development E2E text chat path through the BFF', async () => {
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

  it('verifies the development E2E image attachment path through the BFF', async () => {
    process.env = {
      ...originalEnv,
      THINKPAD_FUNNEL_URL: 'https://thinkpad.example.com/',
      THINKPAD_BRIDGE_TOKEN: 'SERVER_TOKEN',
    }
    const fetchMock = vi.fn(async () =>
      Response.json({
        success: true,
        message: '이미지 분석 완료',
      }),
    )
    global.fetch = fetchMock as typeof fetch

    const response = await POST(
      new Request('http://localhost/api/arcus/message', {
        method: 'POST',
        body: JSON.stringify({
          text: '이 이미지 봐줘',
          attachment_type: 'image',
          attachment_data: 'ABC123',
          attachment_name: 'upload.jpg',
          message_id: 'client-image-1',
        }),
      }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: '이미지 분석 완료',
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
          text: '이 이미지 봐줘',
          attachment_type: 'image',
          attachment_data: 'ABC123',
          attachment_name: 'upload.jpg',
          message_id: 'client-image-1',
        }),
      },
    )
  })
})
