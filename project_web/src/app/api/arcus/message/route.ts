import { NextResponse } from 'next/server'

import { requireAllowedUser } from '@/auth/requireAllowedUser'
import { getAuthFailure } from '@/auth/routeProtection'

type ArcusMessagePayload = {
  text?: string
  attachment_type?: string | null
  attachment_data?: string | null
  attachment_mime?: string | null
  attachment_name?: string
  message_id?: string
}

type BridgeErrorBody = {
  detail?: string
  error?: string
  error_code?: string
  error_stage?: string
}

function formatScheduleMessage(schedules: unknown): string | null {
  if (!Array.isArray(schedules)) return null

  const lines = schedules.flatMap((schedule) => {
    if (
      !schedule ||
      typeof schedule !== 'object' ||
      typeof schedule.start_time !== 'string' ||
      typeof schedule.summary !== 'string'
    ) {
      return []
    }

    return `✅ ${schedule.start_time.slice(0, 10)} ${schedule.summary}`
  })

  return lines.length ? `마스터, 스케줄 등록이 완료되었습니다.\n\n${lines.join('\n')}` : null
}

function getThinkPadEndpoint(): string {
  const baseUrl = process.env.THINKPAD_FUNNEL_URL

  if (!baseUrl) {
    throw new Error('THINKPAD_FUNNEL_URL is not configured')
  }

  return `${baseUrl.replace(/\/$/, '')}/api/arcus/message`
}

function getBridgeToken(): string {
  const token = process.env.THINKPAD_BRIDGE_TOKEN

  if (!token) {
    throw new Error('THINKPAD_BRIDGE_TOKEN is not configured')
  }

  return token
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Failed to connect to ThinkPad bridge'
}

function normalizeBridgeError(status: number, data: BridgeErrorBody) {
  if (status === 413) {
    return {
      success: false,
      error: '이미지 용량이 너무 큽니다. 더 작은 사진으로 다시 시도해 주세요.',
      error_code: 'IMAGE_TOO_LARGE',
      error_stage: 'bff_to_thinkpad',
    }
  }

  return {
    success: false,
    error: data.error ?? data.detail ?? `ThinkPad returned ${status}`,
    error_code: data.error_code ?? 'THINKPAD_REQUEST_FAILED',
    error_stage: data.error_stage ?? 'bff_to_thinkpad',
  }
}

export async function POST(request: Request) {
  const authFailure = getAuthFailure(await requireAllowedUser())

  if (authFailure) {
    return NextResponse.json(authFailure.body, { status: authFailure.status })
  }

  try {
    const payload = (await request.json()) as ArcusMessagePayload
    const body = {
      text: payload.text ?? '',
      attachment_type: payload.attachment_type ?? null,
      attachment_data: payload.attachment_data ?? null,
      attachment_mime: payload.attachment_mime ?? null,
      attachment_name: payload.attachment_name ?? 'upload.jpg',
      message_id: payload.message_id ?? `web-${Date.now()}`,
    }

    const response = await fetch(getThinkPadEndpoint(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getBridgeToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(normalizeBridgeError(response.status, data), {
        status: response.status,
      })
    }

    const message = formatScheduleMessage(data.schedules)
    return NextResponse.json(message ? { ...data, message } : data)
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error),
      },
      { status: 500 },
    )
  }
}
