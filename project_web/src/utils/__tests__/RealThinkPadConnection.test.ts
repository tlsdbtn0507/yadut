import { describe, it, expect } from 'vitest'

describe('ThinkPad Bridge Real Connection Integration Test (TDD Real Node Connection)', () => {
  it('should successfully perform secure auth handshake with real hardware ThinkPad', async () => {
    const THINKPAD_WS_URL = 'ws://100.122.25.31:8000/ws'
    // Load the secret token defined in workspace env or fallback to a default secure token
    const token = 'SECRET_KEY'
    
    // Connect a real raw WebSocket to the ThinkPad bridge
    const socket = new WebSocket(THINKPAD_WS_URL)
    
    const handshakePromise = new Promise<{ success: boolean; data?: any }>((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.close()
        reject(new Error('Handshake timeout: Real ThinkPad did not respond with auth_success within 3.5 seconds.'))
      }, 3500)

      socket.onopen = () => {
        // Send the mandatory first auth packet as designed in Stage 1
        const authPacket = {
          type: 'auth',
          token: token
        }
        socket.send(JSON.stringify(authPacket))
      }

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data)
          if (payload.type === 'auth_success') {
            clearTimeout(timeout)
            socket.close()
            resolve({ success: true, data: payload })
          }
        } catch (e) {
          // Ignore parse errors for non-auth messages
        }
      }

      socket.onerror = (err) => {
        clearTimeout(timeout)
        reject(err)
      }
    })

    // Expect the real physical handshake to resolve successfully
    const result = await handshakePromise
    expect(result.success).toBe(true)
    expect(result.data.type).toBe('auth_success')
  }, 10000) // Give 10 seconds timeout for real network tailscale path
})
