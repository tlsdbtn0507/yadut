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

    expect(response.status).toBe(500)
    expect(fetchMock).toHaveBeenCalledTimes(1)
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
