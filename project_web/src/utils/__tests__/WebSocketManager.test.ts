import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WebSocketManager, WebSocketStatus } from '../WebSocketManager'

// Mock standard WebSocket behavior
class MockWebSocket {
  url: string
  readyState: number = 0 // CONNECTING
  sentMessages: string[] = []
  closeCalled = false
  closeCode: number | undefined
  
  onopen: (() => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: ((error: Event) => void) | null = null

  constructor(url: string) {
    this.url = url
    // Simulate connection success after microtask
    setTimeout(() => {
      this.readyState = 1 // OPEN
      if (this.onopen) this.onopen()
    }, 0)
  }

  send(data: string) {
    this.sentMessages.push(data)
  }

  close(code?: number) {
    this.closeCalled = true
    this.closeCode = code
    this.readyState = 3 // CLOSED
    if (this.onclose) this.onclose({ code: code ?? 1000 })
  }
}

describe('WebSocketManager (TDD Step 1: Core Security WebSocket)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', MockWebSocket)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('test_websocket_connect_success: should establish connection and update status to connecting', () => {
    const manager = new WebSocketManager('ws://100.122.25.31:8000/ws', 'SECRET_KEY')
    
    // Initial status should be connecting
    expect(manager.status).toBe(WebSocketStatus.CONNECTING)
  })

  it('test_websocket_auth_handshake_sent: should immediately send auth JSON packet upon opening', async () => {
    const manager = new WebSocketManager('ws://100.122.25.31:8000/ws', 'SECRET_KEY')
    
    // Fast-forward connection microtask
    vi.advanceTimersByTime(0)
    
    const socket = manager.getSocket() as unknown as MockWebSocket
    expect(socket).toBeDefined()
    expect(socket.sentMessages.length).toBe(1)
    
    const authMessage = JSON.parse(socket.sentMessages[0])
    expect(authMessage.type).toBe('auth')
    expect(authMessage.token).toBe('SECRET_KEY')
  })

  it('test_websocket_auth_timeout: should close socket if no auth_success is received within 3 seconds', async () => {
    const manager = new WebSocketManager('ws://100.122.25.31:8000/ws', 'SECRET_KEY')
    
    // Connection opened, sends auth packet
    vi.advanceTimersByTime(0)
    
    const socket = manager.getSocket() as unknown as MockWebSocket
    expect(manager.status).toBe(WebSocketStatus.CONNECTING) // still connecting (waiting for auth_success)
    
    // Fast-forward 3 seconds for timeout
    vi.advanceTimersByTime(3000)
    
    expect(socket.closeCalled).toBe(true)
    expect(manager.status).toBe(WebSocketStatus.DISCONNECTED)
  })

  it('test_websocket_auth_success: should transition to connected when auth_success is acknowledged', async () => {
    const manager = new WebSocketManager('ws://100.122.25.31:8000/ws', 'SECRET_KEY')
    
    vi.advanceTimersByTime(0)
    const socket = manager.getSocket() as unknown as MockWebSocket
    
    // Simulate server sending auth_success response
    socket.onmessage!({ data: JSON.stringify({ type: 'auth_success' }) })
    
    expect(manager.status).toBe(WebSocketStatus.CONNECTED)
    
    // Advancing timers should NOT trigger timeout close now
    vi.advanceTimersByTime(3000)
    expect(socket.closeCalled).toBe(false)
  })
})
