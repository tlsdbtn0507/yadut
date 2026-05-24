export enum WebSocketStatus {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR'
}

export class WebSocketManager {
  private socket: WebSocket | null = null
  private _status: WebSocketStatus = WebSocketStatus.DISCONNECTED
  private authTimeout: any = null
  private token: string
  private onMessageReceived: ((message: string) => void) | null = null

  constructor(url: string, token: string) {
    this.token = token
    this.connect(url)
  }

  get status(): WebSocketStatus {
    return this._status
  }

  getSocket(): WebSocket | null {
    return this.socket
  }

  // Registers callback for receiving real-time Arcus responses
  setOnMessage(cb: (message: string) => void) {
    this.onMessageReceived = cb
  }

  private connect(url: string) {
    this._status = WebSocketStatus.CONNECTING
    
    try {
      this.socket = new WebSocket(url)
      
      // Start 3-second security auth handshake timeout
      this.authTimeout = setTimeout(() => {
        if (this._status !== WebSocketStatus.CONNECTED) {
          this.disconnect()
        }
      }, 3000)

      this.socket.onopen = () => {
        // Send the mandatory first auth handshake packet
        const authPacket = {
          type: 'auth',
          token: this.token
        }
        this.socket?.send(JSON.stringify(authPacket))
      }

      this.socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data)
          if (payload.type === 'auth_success') {
            this._status = WebSocketStatus.CONNECTED
            if (this.authTimeout) {
              clearTimeout(this.authTimeout)
              this.authTimeout = null
            }
            return
          }
        } catch (e) {
          // Fallback if payload is not strict JSON (raw string dialogues)
        }

        // Forward actual physical chat message back to frontend
        if (this.onMessageReceived) {
          this.onMessageReceived(event.data)
        }
      }

      this.socket.onclose = () => {
        this._status = WebSocketStatus.DISCONNECTED
        if (this.authTimeout) {
          clearTimeout(this.authTimeout)
          this.authTimeout = null
        }
      }

      this.socket.onerror = () => {
        this._status = WebSocketStatus.ERROR
      }

    } catch (error) {
      this._status = WebSocketStatus.ERROR
    }
  }

  // Sends raw chat payload complying with ThinkPad main.py specifications
  sendPacket(text: string, base64Image?: string | null) {
    if (this._status !== WebSocketStatus.CONNECTED || !this.socket) {
      throw new Error('WebSocket is not authenticated or connected.')
    }

    let attachmentData = null
    if (base64Image) {
      // Strip metadata headers like "data:image/jpeg;base64,"
      const parts = base64Image.split(',')
      attachmentData = parts.length > 1 ? parts[1] : parts[0]
    }

    const payload = {
      text: text,
      attachment_type: base64Image ? 'image' : null,
      attachment_data: attachmentData,
      message_id: `ws-${Date.now()}`
    }

    this.socket.send(JSON.stringify(payload))
  }

  disconnect() {
    if (this.socket) {
      this.socket.close()
      this.socket = null
    }
    this._status = WebSocketStatus.DISCONNECTED
    if (this.authTimeout) {
      clearTimeout(this.authTimeout)
      this.authTimeout = null
    }
  }
}
