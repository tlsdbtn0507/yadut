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
      '씽크패드에서 요청을 분석하는 중 오류가 발생했습니다.',
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

  it.each([
    ['bff_to_thinkpad', '씽크패드 서버에 연결하지 못했습니다. 서버 상태를 확인해 주세요.'],
    ['thinkpad_processing', '씽크패드에서 요청을 분석하는 중 오류가 발생했습니다.'],
    ['web_search', '웹 검색 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'],
    ['macbook_upload', '맥북 서버로 이미지를 전달하는 중 오류가 발생했습니다.'],
    ['image_analysis', '맥북에서 이미지를 분석하는 중 오류가 발생했습니다.'],
    ['calendar_sync', '맥북 캘린더에 일정을 반영하는 중 오류가 발생했습니다.'],
  ])('shows a user-facing error for the %s stage', async (errorStage, expected) => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(
          `event: failed\ndata: {"type":"failed","message":"private upstream detail","error_code":"internal_code","error_stage":"${errorStage}"}\n\n`,
        ))
        controller.close()
      },
    })
    global.fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ authenticated: true, transport: 'bff_pending' }))
      .mockResolvedValueOnce(new Response(stream)) as typeof fetch

    render(<ArcusConsole />)
    fireEvent.change(screen.getByPlaceholderText('마스터, 지시 사항을 입력하십시오...'), {
      target: { value: '요청' },
    })
    fireEvent.click(screen.getByRole('button', { name: '▲' }))

    expect(await screen.findByText(expected)).toBeInTheDocument()
    expect(screen.queryByText('private upstream detail')).not.toBeInTheDocument()
    expect(screen.queryByText('internal_code')).not.toBeInTheDocument()
  })

  it('reports the Arcus request server when the browser request fails', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ authenticated: true, transport: 'bff_pending' }))
      .mockRejectedValueOnce(new Error('private network detail')) as typeof fetch

    render(<ArcusConsole />)
    fireEvent.change(screen.getByPlaceholderText('마스터, 지시 사항을 입력하십시오...'), {
      target: { value: '안녕' },
    })
    fireEvent.click(screen.getByRole('button', { name: '▲' }))

    expect(await screen.findByText(
      '아르커스 요청 서버에 연결하지 못했습니다. 네트워크 상태를 확인해 주세요.',
    )).toBeInTheDocument()
    expect(screen.queryByText('private network detail')).not.toBeInTheDocument()
  })

  it('uses the last SSE stage when the stream disconnects', async () => {
    let readCount = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (readCount++ === 0) {
          controller.enqueue(encoder.encode(
            'event: macbook_upload\ndata: {"type":"macbook_upload","message":"이미지를 전달하고 있습니다."}\n\n',
          ))
          return
        }
        controller.error(new Error('private stream detail'))
      },
    })
    global.fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ authenticated: true, transport: 'bff_pending' }))
      .mockResolvedValueOnce(new Response(stream)) as typeof fetch

    render(<ArcusConsole />)
    fireEvent.change(screen.getByPlaceholderText('마스터, 지시 사항을 입력하십시오...'), {
      target: { value: '사진 분석' },
    })
    fireEvent.click(screen.getByRole('button', { name: '▲' }))

    expect(await screen.findByText(
      '맥북 서버로 이미지를 전달하는 중 오류가 발생했습니다.',
    )).toBeInTheDocument()
    expect(screen.queryByText('private stream detail')).not.toBeInTheDocument()
  })
})
