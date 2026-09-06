// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/auth/requireAllowedUser', () => ({
  requireAllowedUser: vi.fn(async () => ({
    ok: true,
    email: 'me@gmail.com',
  })),
}))

import { requireAllowedUser } from '@/auth/requireAllowedUser'
import { POST } from '../route'

describe('/api/arcus/message/stream', () => {
  const originalEnv = process.env
  const originalFetch = global.fetch

  afterEach(() => {
    process.env = originalEnv
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('proxies authenticated ThinkPad SSE without exposing bridge token', async () => {
    process.env = {
      ...originalEnv,
      THINKPAD_FUNNEL_URL: 'https://thinkpad.example.com/',
      THINKPAD_BRIDGE_TOKEN: 'SERVER_TOKEN',
    }
    const upstreamBody = [
      'event: accepted\n',
      'data: {"type":"accepted","message":"요청을 접수했습니다."}\n\n',
    ].join('')
    const fetchMock = vi.fn(async () => new Response(upstreamBody, {
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
    }))
    global.fetch = fetchMock as typeof fetch

    const response = await POST(new Request('http://localhost/api/arcus/message/stream', {
      method: 'POST',
      body: JSON.stringify({ text: '안녕', message_id: 'web-1' }),
    }))

    expect(response.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8')
    expect(response.headers.get('Cache-Control')).toBe('no-cache, no-transform')
    await expect(response.text()).resolves.toBe(upstreamBody)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://thinkpad.example.com/api/arcus/message/stream',
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
          message_id: 'web-1',
        }),
      },
    )
  })

  it('falls back once when ThinkPad explicitly reports SSE unsupported', async () => {
    process.env = {
      ...originalEnv,
      THINKPAD_FUNNEL_URL: 'https://thinkpad.example.com',
      THINKPAD_BRIDGE_TOKEN: 'SERVER_TOKEN',
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 501 }))
      .mockResolvedValueOnce(Response.json({
        success: true,
        message: '기존 HTTP 응답입니다.',
      }))
    global.fetch = fetchMock as typeof fetch

    const response = await POST(new Request('http://localhost/api/arcus/message/stream', {
      method: 'POST',
      body: JSON.stringify({ text: '안녕', message_id: 'web-fallback' }),
    }))
    const body = await response.text()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toBe('https://thinkpad.example.com/api/arcus/message')
    expect(response.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8')
    expect(body).toContain('event: completed')
    expect(body).toContain('"message":"기존 HTTP 응답입니다."')
  })

  it('preserves schedules when falling back to the HTTP endpoint', async () => {
    process.env = {
      ...originalEnv,
      THINKPAD_FUNNEL_URL: 'https://thinkpad.example.com',
      THINKPAD_BRIDGE_TOKEN: 'SERVER_TOKEN',
    }
    const schedules = [
      {
        start_time: '2026-08-29 07:00:00',
        end_time: '2026-08-29 15:00:00',
        summary: '오픈',
      },
    ]
    global.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 501 }))
      .mockResolvedValueOnce(Response.json({
        success: true,
        message: '캘린더 동기화 완료',
        schedules,
      })) as typeof fetch

    const response = await POST(new Request('http://localhost/api/arcus/message/stream', {
      method: 'POST',
      body: JSON.stringify({ text: '근무표 등록', message_id: 'web-schedule' }),
    }))
    const frame = await response.text()
    const event = JSON.parse(frame.split('data: ', 2)[1])

    expect(event.result.schedules).toEqual(schedules)
  })

  it('does not retry an ambiguous ThinkPad processing failure', async () => {
    process.env = {
      ...originalEnv,
      THINKPAD_FUNNEL_URL: 'https://thinkpad.example.com',
      THINKPAD_BRIDGE_TOKEN: 'SERVER_TOKEN',
    }
    const fetchMock = vi.fn(async () => new Response(null, { status: 500 }))
    global.fetch = fetchMock as typeof fetch

    const response = await POST(new Request('http://localhost/api/arcus/message/stream', {
      method: 'POST',
      body: JSON.stringify({ text: '안녕', message_id: 'web-no-retry' }),
    }))
    const event = JSON.parse((await response.text()).split('data: ', 2)[1])

    expect(response.status).toBe(200)
    expect(event).toMatchObject({
      type: 'failed',
      error_code: 'thinkpad_request_failed',
      error_stage: 'thinkpad_processing',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns a safe failed event when ThinkPad is unreachable', async () => {
    process.env = {
      ...originalEnv,
      THINKPAD_FUNNEL_URL: 'https://thinkpad.example.com',
      THINKPAD_BRIDGE_TOKEN: 'SERVER_TOKEN',
    }
    global.fetch = vi.fn().mockRejectedValue(new Error('private socket detail')) as typeof fetch

    const response = await POST(new Request('http://localhost/api/arcus/message/stream', {
      method: 'POST',
      body: JSON.stringify({ text: '안녕', message_id: 'web-offline' }),
    }))
    const body = await response.text()
    const event = JSON.parse(body.split('data: ', 2)[1])

    expect(response.status).toBe(200)
    expect(event).toEqual({
      type: 'failed',
      message: '씽크패드 서버에 연결하지 못했습니다.',
      error_code: 'thinkpad_unreachable',
      error_stage: 'bff_to_thinkpad',
    })
    expect(body).not.toContain('private socket detail')
  })

  it('preserves error location when the HTTP fallback fails', async () => {
    process.env = {
      ...originalEnv,
      THINKPAD_FUNNEL_URL: 'https://thinkpad.example.com',
      THINKPAD_BRIDGE_TOKEN: 'SERVER_TOKEN',
    }
    global.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 501 }))
      .mockResolvedValueOnce(Response.json({
        success: false,
        error: '이미지 업로드 실패',
        error_code: 'MACBOOK_UPLOAD_FAILED',
        error_stage: 'macbook_upload',
      }, { status: 500 })) as typeof fetch

    const response = await POST(new Request('http://localhost/api/arcus/message/stream', {
      method: 'POST',
      body: JSON.stringify({ text: '사진 분석', message_id: 'web-fallback-error' }),
    }))
    const event = JSON.parse((await response.text()).split('data: ', 2)[1])

    expect(event).toMatchObject({
      type: 'failed',
      error_code: 'MACBOOK_UPLOAD_FAILED',
      error_stage: 'macbook_upload',
    })
  })

  it('reports ThinkPad connectivity when the HTTP fallback cannot connect', async () => {
    process.env = {
      ...originalEnv,
      THINKPAD_FUNNEL_URL: 'https://thinkpad.example.com',
      THINKPAD_BRIDGE_TOKEN: 'SERVER_TOKEN',
    }
    global.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 501 }))
      .mockRejectedValueOnce(new Error('private fallback socket detail')) as typeof fetch

    const response = await POST(new Request('http://localhost/api/arcus/message/stream', {
      method: 'POST',
      body: JSON.stringify({ text: '안녕', message_id: 'web-fallback-offline' }),
    }))
    const body = await response.text()
    const event = JSON.parse(body.split('data: ', 2)[1])

    expect(event).toMatchObject({
      type: 'failed',
      error_code: 'thinkpad_unreachable',
      error_stage: 'bff_to_thinkpad',
    })
    expect(body).not.toContain('private fallback socket detail')
  })

  it('rejects unauthenticated requests before contacting ThinkPad', async () => {
    vi.mocked(requireAllowedUser).mockResolvedValueOnce({
      ok: false,
      status: 401,
      code: 'unauthorized',
    })
    const fetchMock = vi.fn()
    global.fetch = fetchMock as typeof fetch

    const response = await POST(new Request('http://localhost/api/arcus/message/stream', {
      method: 'POST',
      body: JSON.stringify({ text: '안녕' }),
    }))

    expect(response.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
