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
          attachment_mime: null,
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
          attachment_mime: null,
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
          attachment_mime: 'image/jpeg',
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
          attachment_mime: 'image/jpeg',
          attachment_name: 'upload.jpg',
          message_id: 'client-image-1',
        }),
      },
    )
  })

  it('formats synced schedules for the web Arcus response', async () => {
    process.env = {
      ...originalEnv,
      THINKPAD_FUNNEL_URL: 'https://thinkpad.example.com',
      THINKPAD_BRIDGE_TOKEN: 'SERVER_TOKEN',
    }
    global.fetch = vi.fn(async () =>
      Response.json({
        success: true,
        message: 'Calendar updated',
        schedules: [
          { summary: '마감', start_time: '2026-08-17 오후 04:30:00' },
          { summary: '오픈', start_time: '2026-08-18 오전 11:00:00' },
          { summary: '휴무', start_time: '2026-08-19 오전 09:00:00' },
        ],
      }),
    ) as typeof fetch

    const response = await POST(
      new Request('http://localhost/api/arcus/message', {
        method: 'POST',
        body: JSON.stringify({ text: '스케줄 넣어줘' }),
      }),
    )

    await expect(response.json()).resolves.toEqual({
      success: true,
      message:
        '마스터, 스케줄 등록이 완료되었습니다.\n\n✅ 2026-08-17 마감\n✅ 2026-08-18 오픈\n✅ 2026-08-19 휴무',
      schedules: [
        { summary: '마감', start_time: '2026-08-17 오후 04:30:00' },
        { summary: '오픈', start_time: '2026-08-18 오전 11:00:00' },
        { summary: '휴무', start_time: '2026-08-19 오전 09:00:00' },
      ],
    })
  })

  it('normalizes ThinkPad image processing failures with stage and code', async () => {
    process.env = {
      ...originalEnv,
      THINKPAD_FUNNEL_URL: 'https://thinkpad.example.com',
      THINKPAD_BRIDGE_TOKEN: 'SERVER_TOKEN',
    }
    global.fetch = vi.fn(async () =>
      Response.json(
        {
          success: false,
          error: 'classifier rejected image',
          error_code: 'THINKPAD_IMAGE_PROCESSING_FAILED',
          error_stage: 'thinkpad_image_processing',
        },
        { status: 500 },
      ),
    ) as typeof fetch

    const response = await POST(
      new Request('http://localhost/api/arcus/message', {
        method: 'POST',
        body: JSON.stringify({
          text: '이 이미지 봐줘',
          attachment_type: 'image',
          attachment_data: 'ABC123',
          attachment_mime: 'image/jpeg',
          attachment_name: 'upload.jpg',
          message_id: 'client-image-2',
        }),
      }),
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'classifier rejected image',
      error_code: 'THINKPAD_IMAGE_PROCESSING_FAILED',
      error_stage: 'thinkpad_image_processing',
    })
  })

  it('normalizes oversized payload failures from the bridge', async () => {
    process.env = {
      ...originalEnv,
      THINKPAD_FUNNEL_URL: 'https://thinkpad.example.com',
      THINKPAD_BRIDGE_TOKEN: 'SERVER_TOKEN',
    }
    global.fetch = vi.fn(async () =>
      Response.json({ detail: 'Payload too large' }, { status: 413 }),
    ) as typeof fetch

    const response = await POST(
      new Request('http://localhost/api/arcus/message', {
        method: 'POST',
        body: JSON.stringify({
          text: '큰 이미지',
          attachment_type: 'image',
          attachment_data: 'ABC123',
          attachment_mime: 'image/jpeg',
          attachment_name: 'upload.jpg',
          message_id: 'client-image-3',
        }),
      }),
    )

    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: '이미지 용량이 너무 큽니다. 더 작은 사진으로 다시 시도해 주세요.',
      error_code: 'IMAGE_TOO_LARGE',
      error_stage: 'bff_to_thinkpad',
    })
  })
})
