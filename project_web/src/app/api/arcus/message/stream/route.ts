import { NextResponse } from 'next/server'

import { requireAllowedUser } from '@/auth/requireAllowedUser'
import { getAuthFailure } from '@/auth/routeProtection'

type ArcusMessagePayload = {
  text?: string
  attachment_type?: string | null
  attachment_data?: string | null
  attachment_name?: string
  message_id?: string
}

const SSE_UNSUPPORTED_STATUSES = new Set([404, 405, 415, 501])
const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  'X-Accel-Buffering': 'no',
  'X-Content-Type-Options': 'nosniff',
}

function getFailedResponse(message: string, errorCode: string, errorStage: string): Response {
  const event = { type: 'failed', message, error_code: errorCode, error_stage: errorStage }
  const frame = `event: failed\ndata: ${JSON.stringify(event)}\n\n`
  return new Response(frame, { status: 200, headers: SSE_HEADERS })
}

function getThinkPadEndpoint(path: string): string {
  const baseUrl = process.env.THINKPAD_FUNNEL_URL
  if (!baseUrl) throw new Error('THINKPAD_FUNNEL_URL is not configured')
  return `${baseUrl.replace(/\/$/, '')}${path}`
}

function getBridgeToken(): string {
  const token = process.env.THINKPAD_BRIDGE_TOKEN
  if (!token) throw new Error('THINKPAD_BRIDGE_TOKEN is not configured')
  return token
}

function normalizePayload(payload: ArcusMessagePayload) {
  return {
    text: payload.text ?? '',
    attachment_type: payload.attachment_type ?? null,
    attachment_data: payload.attachment_data ?? null,
    attachment_name: payload.attachment_name ?? 'upload.jpg',
    message_id: payload.message_id ?? `web-${Date.now()}`,
  }
}

function getThinkPadRequest(body: object): RequestInit {
  return {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getBridgeToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }
}

async function getFallbackResponse(upstream: Response, body: object): Promise<Response | null> {
  if (!SSE_UNSUPPORTED_STATUSES.has(upstream.status)) return null

  let fallback: Response
  try {
    fallback = await fetch(
      getThinkPadEndpoint('/api/arcus/message'),
      getThinkPadRequest(body),
    )
  } catch {
    return getFailedResponse(
      '씽크패드 서버에 연결하지 못했습니다.',
      'thinkpad_unreachable',
      'bff_to_thinkpad',
    )
  }
  const data = await fallback.json() as {
    success?: boolean
    message?: string
    error?: string
    schedules?: unknown
    error_code?: string
    error_stage?: string
  }
  const succeeded = fallback.ok && data.success !== false
  const message = data.message ?? data.error ?? '요청 처리에 실패했습니다.'
  const event = succeeded
    ? { type: 'completed', message, result: { message, schedules: data.schedules } }
    : {
        type: 'failed',
        message,
        error_code: data.error_code ?? 'thinkpad_request_failed',
        error_stage: data.error_stage ?? 'thinkpad_processing',
      }
  const frame = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`

  return new Response(frame, { status: 200, headers: SSE_HEADERS })
}

export async function POST(request: Request) {
  const authFailure = getAuthFailure(await requireAllowedUser())
  if (authFailure) {
    return NextResponse.json(authFailure.body, { status: authFailure.status })
  }

  try {
    const body = normalizePayload(await request.json() as ArcusMessagePayload)
    let upstream: Response
    try {
      upstream = await fetch(
        getThinkPadEndpoint('/api/arcus/message/stream'),
        getThinkPadRequest(body),
      )
    } catch {
      return getFailedResponse(
        '씽크패드 서버에 연결하지 못했습니다.',
        'thinkpad_unreachable',
        'bff_to_thinkpad',
      )
    }
    const fallback = await getFallbackResponse(upstream, body)
    if (fallback) return fallback

    if (!upstream.ok || !upstream.body) {
      return getFailedResponse(
        '씽크패드에서 요청을 처리하지 못했습니다.',
        'thinkpad_request_failed',
        'thinkpad_processing',
      )
    }

    return new Response(upstream.body, {
      headers: SSE_HEADERS,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'ThinkPad stream failed'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
