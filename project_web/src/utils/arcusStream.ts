export type ArcusStreamEventType =
  | 'accepted'
  | 'thinkpad_processing'
  | 'intent_identified'
  | 'web_search'
  | 'macbook_upload'
  | 'image_analysis'
  | 'calendar_sync'
  | 'completed'
  | 'failed'

export interface ArcusStreamEvent {
  type: ArcusStreamEventType
  request_id?: string
  message: string
  action?: string
  result?: { message?: string; schedules?: unknown }
  error_code?: string
  error_stage?: string
}

async function getResponseError(response: Response): Promise<string> {
  try {
    const data = await response.json() as { error?: string }
    return data.error ?? `ARCUS stream returned ${response.status}`
  } catch {
    return `ARCUS stream returned ${response.status}`
  }
}

function parseFrame(frame: string): ArcusStreamEvent | null {
  const data = frame
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')

  return data ? JSON.parse(data) as ArcusStreamEvent : null
}

export async function readArcusStream(
  response: Response,
  onEvent: (event: ArcusStreamEvent) => void,
): Promise<void> {
  if (!response.ok) throw new Error(await getResponseError(response))
  if (!response.body) throw new Error('ARCUS stream body is missing')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    buffer = buffer.replace(/\r\n/g, '\n')

    let boundary = buffer.indexOf('\n\n')
    while (boundary >= 0) {
      const event = parseFrame(buffer.slice(0, boundary))
      buffer = buffer.slice(boundary + 2)
      if (event) onEvent(event)
      boundary = buffer.indexOf('\n\n')
    }

    if (done) break
  }

  const finalEvent = parseFrame(buffer.trim())
  if (finalEvent) onEvent(finalEvent)
}
