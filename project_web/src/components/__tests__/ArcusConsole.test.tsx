import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ArcusConsole from '../ArcusConsole'

describe('ArcusConsole SSE processing status', () => {
  const originalFetch = global.fetch
  const encoder = new TextEncoder()

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    cleanup()
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('shows Korean server status without exposing internal action codes', async () => {
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller
        controller.enqueue(encoder.encode(
          'event: intent_identified\ndata: {"type":"intent_identified","action":"SCHEDULE_SYNC","message":"캘린더 일정 등록 요청으로 파악했습니다."}\n\n',
        ))
      },
    })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        authenticated: true,
        transport: 'bff_pending',
      }))
      .mockResolvedValueOnce(new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
      }))
    global.fetch = fetchMock as typeof fetch

    render(<ArcusConsole />)
    fireEvent.change(screen.getByPlaceholderText('마스터, 지시 사항을 입력하십시오...'), {
      target: { value: '이 근무표를 등록해줘' },
    })
    fireEvent.click(screen.getByRole('button', { name: '▲' }))

    expect(await screen.findByText(
      '캘린더 일정 등록 요청으로 파악했습니다.',
      {},
      { timeout: 3000 },
    )).toBeInTheDocument()
    expect(screen.queryByText('아르커스 연산 사유 엔진 분석 중...')).not.toBeInTheDocument()
    expect(screen.getByRole('status', {
      name: '캘린더 일정 등록 요청으로 파악했습니다.',
    })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: '요청 처리 진행률' })).toHaveAttribute(
      'aria-valuenow',
      '40',
    )
    expect(screen.queryByText('SCHEDULE_SYNC')).not.toBeInTheDocument()

    streamController?.enqueue(encoder.encode(
      'event: completed\ndata: {"type":"completed","message":"완료","result":{"message":"일정 등록이 완료되었습니다."}}\n\n',
    ))
    streamController?.close()

    expect(await screen.findByText('일정 등록이 완료되었습니다.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/arcus/message/stream', expect.objectContaining({
      method: 'POST',
    }))
  }, 5000)

  it('shows a Korean error when the stream ends without a terminal event', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(
          'event: accepted\ndata: {"type":"accepted","message":"요청을 접수했습니다."}\n\n',
        ))
        controller.close()
      },
    })
    global.fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({
        authenticated: true,
        transport: 'bff_pending',
      }))
      .mockResolvedValueOnce(new Response(stream)) as typeof fetch

    render(<ArcusConsole />)
    fireEvent.change(screen.getByPlaceholderText('마스터, 지시 사항을 입력하십시오...'), {
      target: { value: '안녕' },
    })
    fireEvent.click(screen.getByRole('button', { name: '▲' }))

    expect(await screen.findByText(
      '죄송합니다, 마스터. 요청 처리 상태 연결이 끊겼습니다. 다시 시도해 주십시오.',
    )).toBeInTheDocument()
  })

  it('shows synced schedule details from the completed SSE event', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(
          'event: completed\ndata: {"type":"completed","message":"캘린더 동기화 완료","result":{"message":"캘린더 동기화 완료","schedules":[{"start_time":"2026-08-29 07:00:00","end_time":"2026-08-29 15:00:00","summary":"오픈"},{"start_time":"2026-08-30 09:00:00","end_time":"2026-08-30 09:00:00","summary":"휴무"}]}}\n\n',
        ))
        controller.close()
      },
    })
    global.fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({
        authenticated: true,
        transport: 'bff_pending',
      }))
      .mockResolvedValueOnce(new Response(stream)) as typeof fetch

    render(<ArcusConsole />)
    fireEvent.change(screen.getByPlaceholderText('마스터, 지시 사항을 입력하십시오...'), {
      target: { value: '이 근무표를 등록해줘' },
    })
    fireEvent.click(screen.getByRole('button', { name: '▲' }))

    const expected = '마스터, 스케줄 등록이 완료되었습니다.\n\n✅ 2026-08-29 오픈\n✅ 2026-08-30 휴무'
    expect(await screen.findByText(
      (_, element) => element?.textContent === expected,
      { selector: 'p' },
    )).toBeInTheDocument()
  })
})
