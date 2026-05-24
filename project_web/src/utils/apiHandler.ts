import { parseMemory } from './parseMemory'

export interface CaptureResult {
  success: boolean
  imageUrl?: string
  error?: string
}

export interface SyncResult {
  success: boolean
  message: string
}

export interface ChatResult {
  success: boolean
  text: string
  memoryUpdates: string[]
}

const BASE_URL = process.env.NEXT_PUBLIC_THINKPAD_HTTP_URL ?? 'http://100.122.25.31:8000'

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Capture request failed'
}

export const apiHandler = {
  async captureScreen(): Promise<CaptureResult> {
    try {
      const response = await fetch(`${BASE_URL}/capture`, {
        method: 'POST'
      })
      if (!response.ok) {
        throw new Error('Capture failed')
      }
      return await response.json()
    } catch (error: unknown) {
      return {
        success: false,
        error: getErrorMessage(error)
      }
    }
  },

  async syncCalendar(imageBase64: string): Promise<SyncResult> {
    try {
      const response = await fetch(`${BASE_URL}/sync_calendar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ image: imageBase64 })
      })
      if (!response.ok) {
        throw new Error('Sync failed')
      }
      return await response.json()
    } catch {
      // Arcus soul compliant fallback response
      return {
        success: false,
        message: '죄송합니다, 마스터. 일정 분석 및 캘린더 등록에 실패했습니다. 이미지 상태를 다시 확인해 주시겠습니까?'
      }
    }
  },

  async sendChatMessage(text: string): Promise<ChatResult> {
    try {
      const response = await fetch(`${BASE_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text })
      })
      if (!response.ok) {
        throw new Error('Chat failed')
      }
      const data = await response.json()
      
      // Integrate Memory Parser implemented in Stage 2
      const parsed = parseMemory(data.message || '')
      
      return {
        success: true,
        text: parsed.text,
        memoryUpdates: parsed.memoryUpdates
      }
    } catch {
      return {
        success: false,
        text: '죄송합니다, 마스터. 서버와의 대화 전송 중 오류가 발생했습니다.',
        memoryUpdates: []
      }
    }
  }
}
