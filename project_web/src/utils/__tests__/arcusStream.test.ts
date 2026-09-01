import { describe, expect, it } from 'vitest'

import { type ArcusStreamEvent, readArcusStream } from '../arcusStream'

function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(body, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
  })
}

describe('readArcusStream', () => {
  it('parses Korean SSE data split across chunks', async () => {
    const response = streamResponse([
      'event: accepted\ndata: {"type":"accepted","request_id":"web-1","message":"요청을 ',
      '접수했습니다."}\n\nevent: completed\ndata: {"type":"completed","request_id":"web-1",',
      '"message":"완료","result":{"message":"최종 응답"}}\n\n',
    ])
    const events: ArcusStreamEvent[] = []

    await readArcusStream(response, (event) => events.push(event))

    expect(events.map((event) => event.message)).toEqual([
      '요청을 접수했습니다.',
      '완료',
    ])
    expect(events[1].result?.message).toBe('최종 응답')
  })

  it('rejects a non-stream response before reading events', async () => {
    const response = Response.json(
      { success: false, error: 'ThinkPad unavailable' },
      { status: 503 },
    )

    await expect(readArcusStream(response, () => undefined)).rejects.toThrow(
      'ThinkPad unavailable',
    )
  })
})
