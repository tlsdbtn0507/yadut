import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { apiHandler } from '../apiHandler'

describe('API Scenario Handler (TDD Step 4: Scenario Integration Mocks)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('should handle capture screen request successfully', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({ success: true, imageUrl: 'http://100.84.129.54:3000/screenshots/latest.png' })
    }
    vi.mocked(fetch).mockResolvedValue(mockResponse as any)

    const result = await apiHandler.captureScreen()
    
    expect(fetch).toHaveBeenCalledWith('http://100.122.25.31:8000/capture', { method: 'POST' })
    expect(result).toEqual({
      success: true,
      imageUrl: 'http://100.84.129.54:3000/screenshots/latest.png'
    })
  })

  it('should handle sync calendar request with Arcus compliant response on success', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        success: true,
        message: '마스터, 요청하신 캘린더 일정이 성공적으로 동기화되었습니다. 정상적으로 반영되었으니 캘린더를 확인해 주십시오!'
      })
    }
    vi.mocked(fetch).mockResolvedValue(mockResponse as any)

    const result = await apiHandler.syncCalendar('BASE64_IMAGE_DATA')
    
    expect(fetch).toHaveBeenCalledWith('http://100.122.25.31:8000/sync_calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: 'BASE64_IMAGE_DATA' })
    })
    expect(result).toEqual({
      success: true,
      message: '마스터, 요청하신 캘린더 일정이 성공적으로 동기화되었습니다. 정상적으로 반영되었으니 캘린더를 확인해 주십시오!'
    })
  })

  it('should handle sync calendar request failures gracefully with Arcus tone fallback', async () => {
    // Simulate network error
    vi.mocked(fetch).mockRejectedValue(new Error('Network disconnected'))

    const result = await apiHandler.syncCalendar('BASE64_IMAGE_DATA')
    
    expect(result).toEqual({
      success: false,
      message: '죄송합니다, 마스터. 일정 분석 및 캘린더 등록에 실패했습니다. 이미지 상태를 다시 확인해 주시겠습니까?'
    })
  })

  it('should process chat message response and integrate parseMemory successfully', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        message: '마스터, 요청하신 분석을 시작합니다. [MEMORY_UPDATE: 마스터 관심사: 인공지능]'
      })
    }
    vi.mocked(fetch).mockResolvedValue(mockResponse as any)

    const result = await apiHandler.sendChatMessage('안녕')
    
    expect(fetch).toHaveBeenCalledWith('http://100.122.25.31:8000/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '안녕' })
    })
    
    // Result text must be cleaned up and memory updates must be isolated
    expect(result).toEqual({
      success: true,
      text: '마스터, 요청하신 분석을 시작합니다. ',
      memoryUpdates: ['마스터 관심사: 인공지능']
    })
  })
})
