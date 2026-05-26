'use client'

import React, { useState, useRef, useEffect } from 'react'
import { TelemetryMode, TelemetryStage, TelemetryEngine } from '../utils/telemetry'
import { parseMemory } from '../utils/parseMemory'
import { WebSocketManager, WebSocketStatus } from '../utils/WebSocketManager'
import { shouldSubmitChatKey } from '../utils/chatKeyboard'
import styles from './page.module.css'

interface Message {
  id: string
  sender: 'user' | 'arcus'
  text: string
  time: string
  image?: string
  file?: string
  memoryUpdates?: string[]
}

interface RuntimeConfig {
  thinkpadWsUrl: string
  wsToken: string
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}

async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  const response = await fetch('/api/runtime-config', { cache: 'no-store' })
  if (!response.ok) {
    throw new Error('Runtime config request failed')
  }
  return response.json() as Promise<RuntimeConfig>
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'init-1',
      sender: 'arcus',
      text: '안녕하십니까, 마스터. 야두트 모바일 콘솔이 연동되었습니다. 씽크패드 브리지 및 맥북 서버가 대기 중입니다. 지시 사항을 입력해 주십시오.',
      time: '17:50',
      memoryUpdates: []
    }
  ])
  
  const [inputText, setInputText] = useState<string>('')
  const [stagedImage, setStagedImage] = useState<string | null>(null)
  const [stagedFile, setStagedFile] = useState<{ name: string; type: string } | null>(null)
  
  // Real Hardware WebSocket instance
  const [wsStatus, setWsStatus] = useState<WebSocketStatus>(WebSocketStatus.DISCONNECTED)
  const wsManagerRef = useRef<WebSocketManager | null>(null)

  // Telemetry state inside thinking cycle
  const [isThinking, setIsThinking] = useState<boolean>(false)
  const [telemetryStage, setTelemetryStage] = useState<TelemetryStage>(TelemetryStage.CLIENT_TX)
  const [telemetryLog, setTelemetryLog] = useState<string>('')

  const chatEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 1. Establish Real-time Secure WebSocket Hardware Connection on mount
  useEffect(() => {
    let statusInterval: ReturnType<typeof setInterval> | null = null
    let isMounted = true

    const connect = async () => {
      try {
        const config = await loadRuntimeConfig()
        if (!isMounted) return

        console.log('Connecting real socket to ThinkPad...')
        const manager = new WebSocketManager(config.thinkpadWsUrl, config.wsToken)
        wsManagerRef.current = manager

        // Track status dynamically
        statusInterval = setInterval(() => {
          setWsStatus(manager.status)
        }, 500)

        // Handle real-time Arcus responses incoming from real WebSocket
        manager.setOnMessage((rawMessage: string) => {
          console.log('Real response received:', rawMessage)
          const now = new Date()
          const timeString = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

          // Integrate Memory Parser implemented in Stage 2
          const parsed = parseMemory(rawMessage)

          const arcusMessage: Message = {
            id: `arcus-${Date.now()}`,
            sender: 'arcus',
            text: parsed.text,
            time: timeString,
            memoryUpdates: parsed.memoryUpdates
          }

          setMessages(prev => [...prev, arcusMessage])
          setIsThinking(false)
        })
      } catch (error) {
        console.error('Runtime config load failed:', error)
        setWsStatus(WebSocketStatus.ERROR)
      }
    }

    connect()

    return () => {
      isMounted = false
      if (statusInterval) {
        clearInterval(statusInterval)
      }
      wsManagerRef.current?.disconnect()
      wsManagerRef.current = null
    }
  }, [])

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isThinking])

  // Textarea self-expanding layout (max 5 lines)
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
    }
  }, [inputText])

  // Paperclip Action: Simulate attachments
  const handleAttachmentClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (event) => {
        setStagedImage(event.target?.result as string)
        setStagedFile(null)
      }
      reader.readAsDataURL(file)
    } else {
      setStagedFile({
        name: file.name,
        type: file.name.split('.').pop()?.toUpperCase() || 'FILE'
      })
      setStagedImage(null)
    }
  }

  const removeStaged = () => {
    setStagedImage(null)
    setStagedFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Trigger biological / network simulation matching exact Stage 3/5 timing
  const runThinkingSimulation = async (isImage: boolean): Promise<void> => {
    const mode = isImage ? TelemetryMode.IMAGE : TelemetryMode.TEXT
    setTelemetryStage(TelemetryStage.CLIENT_TX)

    const engine = new TelemetryEngine(mode)
    setTelemetryLog(engine.getTraceLog(120))

    const steps = isImage
      ? [
          { stage: TelemetryStage.THINKPAD_GEMMA, dur: 850 },
          { stage: TelemetryStage.MACBOOK_UPLOAD, dur: 2350 },
          { stage: TelemetryStage.GEMINI_NEURAL, dur: 3820 },
          { stage: TelemetryStage.RESPONSE_RX, dur: 4980 }
        ]
      : [
          { stage: TelemetryStage.THINKPAD_GEMMA, dur: 850 },
          { stage: TelemetryStage.RESPONSE_RX, dur: 2000 }
        ]

    for (const step of steps) {
      await new Promise(resolve => setTimeout(resolve, 600))
      setTelemetryStage(step.stage)
      engine.currentStage = step.stage
      setTelemetryLog(engine.getTraceLog(step.dur))
    }
  }

  // Send message action via real WebSocket direct link
  const handleSend = async () => {
    if (!inputText.trim() && !stagedImage && !stagedFile) return
    if (isThinking) return
    if (wsStatus !== WebSocketStatus.CONNECTED) {
      alert('오류: 씽크패드와의 실시간 보안 소켓이 아직 연결되지 않았습니다.')
      return
    }

    const now = new Date()
    const timeString = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: inputText,
      time: timeString,
      image: stagedImage || undefined,
      file: stagedFile ? `${stagedFile.name} (${stagedFile.type})` : undefined
    }

    setMessages(prev => [...prev, userMessage])
    setInputText('')
    setIsThinking(true)

    const isImageAttachment = !!stagedImage
    const savedStagedImage = stagedImage

    removeStaged()

    // 1. Run 3-Node or 5-Node Telemetry Animation
    await runThinkingSimulation(isImageAttachment)

    try {
      // 2. Direct Packet transmission to real ThinkPad socket
      wsManagerRef.current?.sendPacket(userMessage.text, savedStagedImage)
    } catch (err: unknown) {
      const arcusMessage: Message = {
        id: `arcus-${Date.now()}`,
        sender: 'arcus',
        text: `죄송합니다, 마스터. 씽크패드 기기 전송 중 오류가 발생했습니다: ${getErrorMessage(err)}`,
        time: timeString,
        memoryUpdates: []
      }
      setMessages(prev => [...prev, arcusMessage])
      setIsThinking(false)
    }
  }

  // Trigger screen capture proxy (CORS Bypass)
  const handleCaptureScreen = async () => {
    const now = new Date()
    const timeString = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: '📸 아르커스, 맥북 화면을 스캔해 주십시오.',
      time: timeString
    }

    setMessages(prev => [...prev, userMessage])
    setIsThinking(true)

    // Run 5-stage image telemetry
    await runThinkingSimulation(true)

    try {
      // Call BFF Next.js API Route Proxy
      const response = await fetch('/api/capture', { method: 'POST' })
      const res = await response.json()

      if (res.success) {
        const arcusMessage: Message = {
          id: `arcus-${Date.now()}`,
          sender: 'arcus',
          text: '마스터, 요청하신 맥북 화면의 실시간 캡처 스캔이 완료되었습니다. 아래 스크린샷 덤프를 전달해 드립니다.',
          time: timeString,
          image: res.imageUrl
        }
        setMessages(prev => [...prev, arcusMessage])
      } else {
        const arcusMessage: Message = {
          id: `arcus-${Date.now()}`,
          sender: 'arcus',
          text: `죄송합니다, 마스터. 화면 캡처에 실패했습니다: ${res.error}`,
          time: timeString
        }
        setMessages(prev => [...prev, arcusMessage])
      }
    } catch (err: unknown) {
      const arcusMessage: Message = {
        id: `arcus-${Date.now()}`,
        sender: 'arcus',
        text: `죄송합니다, 마스터. 맥북 스캔 서버 연결에 실패했습니다: ${getErrorMessage(err)}`,
        time: timeString
      }
      setMessages(prev => [...prev, arcusMessage])
    }
    
    setIsThinking(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (
      shouldSubmitChatKey({
        key: e.key,
        shiftKey: e.shiftKey,
        isComposing: e.nativeEvent.isComposing,
        keyCode: e.keyCode,
      })
    ) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className={styles.chatContainer}>
      
      {/* Premium Cyber Console Header */}
      <header className={styles.header}>
        <div className={styles.logoGroup}>
          <div className={`${styles.pulseDot} ${
            wsStatus === WebSocketStatus.CONNECTED ? styles.pulseActive : ''
          }`} />
          <span className={styles.logoText}>야두트 (Yadut) // ARCUS CORE</span>
        </div>
        <span className={`${styles.statusBadge} ${
          wsStatus === WebSocketStatus.CONNECTED ? styles.statusActive : ''
        }`}>
          {wsStatus === WebSocketStatus.CONNECTED ? 'SECURE SOCKET ACTIVE' : 
           wsStatus === WebSocketStatus.CONNECTING ? 'CONNECTING HANDSHAKE...' : 'SOCKET OFFLINE'}
        </span>
      </header>

      {/* Chat Bubble Flow Container */}
      <main className={styles.chatFlow}>
        {messages.map((msg) => {
          const isUser = msg.sender === 'user'
          
          return (
            <div 
              key={msg.id} 
              className={`${styles.bubbleWrapper} ${
                isUser ? styles.userAlign : styles.arcusAlign
              }`}
            >
              <div 
                className={`${styles.bubble} ${
                  isUser ? styles.userBubble : styles.arcusBubble
                }`}
              >
                {/* Embedded image preview inside bubble */}
                {msg.image && (
                  <div className={styles.bubbleImageWrapper}>
                    <img src={msg.image} alt="Attachment" className={styles.bubbleImage} />
                  </div>
                )}

                {/* File badge inside bubble */}
                {msg.file && (
                  <div className={styles.bubbleFileCard}>
                    <span className={styles.fileIcon}>📄</span>
                    <span className={styles.fileName}>{msg.file}</span>
                  </div>
                )}

                {/* Dialogue Text */}
                {msg.text && <p className={styles.bubbleText}>{msg.text}</p>}

                {/* Purple Brain Memory Badge - Isolated Bottom Render */}
                {msg.memoryUpdates && msg.memoryUpdates.length > 0 && (
                  <div className={styles.memorySection}>
                    <div className={styles.memoryDivider} />
                    {msg.memoryUpdates.map((update, idx) => (
                      <div key={idx} className={styles.memoryBadge}>
                        <span className={styles.memoryIcon}>🧠</span>
                        <span className={styles.memoryTitle}>기억 업데이트:</span>
                        <span className={styles.memoryText}>{update}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <span className={styles.bubbleTime}>{msg.time}</span>
            </div>
          )
        })}

        {/* Dynamic Thinking Progress Box */}
        {isThinking && (
          <div className={styles.thinkingContainer}>
            <div className={styles.thinkingTitleRow}>
              <div className={styles.thinkingSpinner} />
              <span>아르커스 연산 사유 엔진 분석 중...</span>
            </div>
            
            {/* 1-Line Progress Bar Line */}
            <div className={styles.progressLineContainer}>
              <div 
                className={styles.progressLineGlow} 
                style={{
                  width: telemetryStage === TelemetryStage.CLIENT_TX ? '20%' :
                         telemetryStage === TelemetryStage.THINKPAD_GEMMA ? '40%' :
                         telemetryStage === TelemetryStage.MACBOOK_UPLOAD ? '60%' :
                         telemetryStage === TelemetryStage.GEMINI_NEURAL ? '80%' : '100%',
                  background: telemetryStage === TelemetryStage.RESPONSE_RX ? 'linear-gradient(90deg, #bd00ff, #00f3ff)' : '#00f3ff'
                }}
              />
            </div>

            {/* 1-Line Cyber log text */}
            <div className={styles.oneLineLog}>
              <span className={styles.logPrompt}>&gt;</span>
              <span className={styles.logContent}>{telemetryLog}</span>
            </div>
          </div>
        )}
        
        <div ref={chatEndRef} />
      </main>

      {/* Bottom Glow Capsule Input Bar */}
      <footer className={styles.inputCapsuleContainer}>
        
        {/* Floating horizontal staged attachment preview bar - Now inside footer and anchored using bottom: 100% */}
        {(stagedImage || stagedFile) && (
          <div className={styles.floatingStagedBar}>
            <div className={styles.stagedDetails}>
              {stagedImage ? (
                <div className={styles.stagedThumbnailWrapper}>
                  <img src={stagedImage} alt="Thumbnail" className={styles.stagedThumbnail} />
                </div>
              ) : (
                <span className={styles.stagedFileIcon}>📁</span>
              )}
              <span className={styles.stagedTitle}>
                {stagedImage ? '이미지 파일 대기 중' : stagedFile?.name}
              </span>
            </div>
            <button className={styles.removeStagedBtn} onClick={removeStaged}>✕</button>
          </div>
        )}

        {/* Hidden inputs */}
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          onChange={handleFileChange}
          accept="image/*,application/pdf,text/plain"
        />

        {/* Neon Microphone - Placed at the Leftmost. Triggers Screen Capture */}
        <button 
          className={styles.micBtn} 
          onClick={handleCaptureScreen}
          title="맥북 스크린샷 캡처 실행"
        >
          🎙️
        </button>

        {/* 5-Line Self Expanding Text Input */}
        <textarea
          ref={textareaRef}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="마스터, 지시 사항을 입력하십시오..."
          rows={1}
          className={styles.textField}
        />

        {/* Cyber Paperclip attachment button - Placed directly next to Send */}
        <button 
          className={`${styles.paperclipBtn} ${
            (stagedImage || stagedFile) ? styles.paperclipActive : ''
          }`}
          onClick={handleAttachmentClick}
        >
          📎
        </button>

        {/* Bottom aligned Neon Send Button */}
        <button 
          className={`${styles.sendBtn} ${
            (inputText.trim() || stagedImage || stagedFile) ? styles.sendActive : ''
          }`}
          onClick={handleSend}
          disabled={!inputText.trim() && !stagedImage && !stagedFile}
        >
          ▲
        </button>
      </footer>


    </div>
  )
}
