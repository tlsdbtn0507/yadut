'use client'

import Image from 'next/image'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import styles from '../app/page.module.css'
import { buildArcusPayload } from '../utils/arcusPayload'
import { getArcusFailureMessage } from '../utils/arcusError'
import { type ArcusStreamEvent, readArcusStream } from '../utils/arcusStream'
import { shouldSubmitChatKey } from '../utils/chatKeyboard'
import { compressImageFile } from '../utils/imageCompression'
import { formatScheduleMessage } from '../utils/scheduleMessage'
import { getTelemetryStageForEvent, TelemetryStage } from '../utils/telemetry'
import YadutSidebar, { type ScreenName } from './YadutSidebar'
import { useConversations } from '../hooks/useConversations'
import { useVisualViewportHeight } from '../hooks/useVisualViewportHeight'
import { type Conversation, type ConversationDetail, type SavedMessage, conversationRequest, uploadOriginal } from '../utils/conversations'

type Message = {
  id: string
  sender: 'user' | 'arcus'
  text: string
  time: string
  image?: string
  file?: string
  attachmentUrl?: string
  failure?: string
}

const INITIAL_MESSAGES: Message[] = [{
  id: 'welcome',
  sender: 'arcus',
  text: '안녕하세요. 오늘 필요한 일을 함께 정리해 볼까요?',
  time: '',
}]

function displayTime(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
}

function restoreMessage(message: SavedMessage): Message {
  const attachment = message.attachments[0]
  const url = attachment ? `/api/attachments/${attachment.id}` : undefined
  return { id: message.id, sender: message.role === 'assistant' ? 'arcus' : 'user',
    text: formatScheduleMessage(message.result?.schedules) ?? message.text, time: displayTime(message.created_at),
    image: attachment?.kind === 'image' ? url : undefined,
    file: attachment?.original_name, attachmentUrl: url,
    failure: ['failed', 'interrupted'].includes(message.status)
      ? getArcusFailureMessage(message.error_stage ?? undefined, 'failed')
      : ['processing', 'queued'].includes(message.status) ? '아직 완료되지 않은 요청입니다. 대화를 다시 선택해 상태를 확인해 주세요.' : undefined,
  }
}

function currentTime(): string {
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())
}

export default function ArcusConsole() {
  const viewportStyle = useVisualViewportHeight()
  const history = useConversations()
  const currentConversation = useRef<string | null>(null)
  const selectionVersion = useRef(0)
  const sending = useRef(false)
  const [conversationError, setConversationError] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)
  const preparationVersion = useRef(0)
  const [preparingAttachment, setPreparingAttachment] = useState(false)
  const [originalFile, setOriginalFile] = useState<File | null>(null)
  const [activeScreen, setActiveScreen] = useState<ScreenName>('home')
  const [menuOpen, setMenuOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [threadTitle, setThreadTitle] = useState('새 대화')
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES)
  const [inputText, setInputText] = useState('')
  const [stagedImage, setStagedImage] = useState<string | null>(null)
  const [stagedFile, setStagedFile] = useState<{ name: string; type: string } | null>(null)
  const [isThinking, setIsThinking] = useState(false)
  const [telemetryStage, setTelemetryStage] = useState(TelemetryStage.CLIENT_TX)
  const [telemetryLog, setTelemetryLog] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)
  const messageFlowRef = useRef<HTMLDivElement>(null)
  const chatPinnedRef = useRef(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isComposingRef = useRef(false)
  const submitAfterCompositionRef = useRef(false)
  const compositionEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isThinking])

  useLayoutEffect(() => {
    if (chatPinnedRef.current) chatEndRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [viewportStyle, stagedImage, stagedFile])

  useEffect(() => {
    if (!textareaRef.current) return
    textareaRef.current.style.height = 'auto'
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
  }, [inputText])

  useEffect(() => () => {
    if (compositionEndTimerRef.current) clearTimeout(compositionEndTimerRef.current)
  }, [])

  const removeStaged = () => {
    preparationVersion.current++
    setPreparingAttachment(false)
    setStagedImage(null)
    setStagedFile(null)
    setOriginalFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const trackChatPin = () => {
    const flow = messageFlowRef.current
    if (!flow) return
    chatPinnedRef.current = flow.scrollHeight - flow.scrollTop - flow.clientHeight <= 48
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    removeStaged()
    setConversationError(null)
    const version = preparationVersion.current
    if (file.size > 20 * 1024 * 1024) {
      setConversationError('첨부 파일은 20MB 이하만 저장할 수 있습니다.')
      return
    }
    if (!file.type.startsWith('image/')) {
      setOriginalFile(file)
      setStagedFile({ name: file.name, type: file.name.split('.').pop()?.toUpperCase() || 'FILE' })
      return
    }
    setPreparingAttachment(true)
    try {
      const compressed = await compressImageFile(file)
      if (version !== preparationVersion.current) return
      setOriginalFile(file)
      setStagedImage(compressed.dataUrl)
    } catch {
      if (version === preparationVersion.current) setConversationError('이미지를 전송 가능한 형식으로 변환하지 못했습니다.')
    } finally {
      if (version === preparationVersion.current) setPreparingAttachment(false)
    }
  }

  const markFailed = (id: string, failure: string) => {
    setMessages((previous) => previous.map((message) => message.id === id ? { ...message, failure } : message))
  }

  const applyArcusEvent = (event: ArcusStreamEvent, userMessage: Message) => {
    setTelemetryStage(getTelemetryStageForEvent(event.type))
    setTelemetryLog(event.message)
    if (event.type === 'completed') {
      setMessages((previous) => [...previous, {
        id: event.assistant_message_id ?? crypto.randomUUID(), sender: 'arcus',
        text: formatScheduleMessage(event.result?.schedules) ?? event.result?.message ?? event.message,
        time: event.created_at ? displayTime(event.created_at) : currentTime(),
      }])
    }
    if (event.type === 'failed') markFailed(userMessage.id, getArcusFailureMessage(event.error_stage, event.type))
  }

  const streamResponse = async (userMessage: Message, image: string | null, cid: string, attachmentIds: string[]) => {
    let lastEventType: ArcusStreamEvent['type'] | 'client_to_bff' = 'client_to_bff'
    let receivedTerminalEvent = false
    try {
      const response = await fetch('/api/arcus/message/stream', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildArcusPayload({ text: userMessage.text, imageDataUrl: image,
          messageId: userMessage.id, conversationId: cid, attachmentIds })),
      })
      await readArcusStream(response, (event) => {
        lastEventType = event.type
        receivedTerminalEvent ||= event.type === 'completed' || event.type === 'failed'
        if (currentConversation.current === cid) applyArcusEvent(event, userMessage)
      })
      if (!receivedTerminalEvent) throw new Error('Missing terminal event')
    } catch {
      if (currentConversation.current === cid) markFailed(userMessage.id, getArcusFailureMessage(undefined, lastEventType))
    } finally {
      setIsThinking(false)
      sending.current = false
      if (historyOpen) void history.refresh()
    }
  }

  const ensureConversation = async (): Promise<string> => {
    if (currentConversation.current) return currentConversation.current
    const conversation = await conversationRequest<Conversation>('', {})
    currentConversation.current = conversation.id
    return conversation.id
  }

  const handleSend = async (suggestedText?: string) => {
    const text = suggestedText ?? inputText
    if ((!text.trim() && !originalFile) || sending.current || restoring || preparingAttachment) return
    sending.current = true
    setIsThinking(true)
    setConversationError(null)
    try {
      const cid = await ensureConversation()
      const attachmentIds = originalFile ? [await uploadOriginal(originalFile)] : []
      const userMessage: Message = { id: crypto.randomUUID(), sender: 'user', text, time: currentTime(),
        image: stagedImage ?? undefined, file: stagedFile?.name }
      setMessages((previous) => [...previous, userMessage])
      setThreadTitle(text.trim() || originalFile?.name || '새 대화')
      setActiveScreen('chat')
      setInputText('')
      setTelemetryStage(TelemetryStage.CLIENT_TX)
      setTelemetryLog('요청을 씽크패드로 전송하고 있습니다.')
      const image = stagedImage
      removeStaged()
      await streamResponse(userMessage, image, cid, attachmentIds)
    } catch (error: unknown) {
      setConversationError(error instanceof Error ? error.message : '대화를 저장하지 못했습니다.')
      setIsThinking(false)
      sending.current = false
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const composing = event.nativeEvent.isComposing || event.keyCode === 229 || isComposingRef.current
    if (event.key === 'Enter' && !event.shiftKey && composing) {
      event.preventDefault()
      submitAfterCompositionRef.current = true
      return
    }
    if (!shouldSubmitChatKey({
      key: event.key,
      shiftKey: event.shiftKey,
      isComposing: event.nativeEvent.isComposing,
      keyCode: event.keyCode,
      compositionSessionActive: isComposingRef.current,
    })) return

    event.preventDefault()
    handleSend()
  }

  const navigate = (screen: ScreenName) => {
    setActiveScreen(screen)
    setMenuOpen(false)
  }

  const startNewChat = async () => {
    if (sending.current || restoring) return
    const version = ++selectionVersion.current
    setRestoring(true)
    setConversationError(null)
    try {
      const conversation = await conversationRequest<Conversation>('', {})
      if (version !== selectionVersion.current) return
      currentConversation.current = conversation.id
      setMessages(INITIAL_MESSAGES)
      setThreadTitle('새 대화')
      setInputText('')
      removeStaged()
      navigate('home')
      if (historyOpen) void history.refresh()
    } catch { setConversationError('새 대화를 만들지 못했습니다. 다시 시도해 주세요.') }
    finally { if (version === selectionVersion.current) setRestoring(false) }
  }

  const selectConversation = async (conversation: Conversation) => {
    if (sending.current) return
    const version = ++selectionVersion.current
    setRestoring(true)
    setConversationError(null)
    try {
      const detail = await conversationRequest<ConversationDetail>(`/${conversation.id}`)
      if (version !== selectionVersion.current) return
      currentConversation.current = detail.id
      setMessages(detail.messages.map(restoreMessage))
      setThreadTitle(detail.title)
      setInputText('')
      removeStaged()
      navigate('chat')
    } catch { setConversationError('대화를 불러오지 못했습니다. 다시 선택해 주세요.') }
    finally { if (version === selectionVersion.current) setRestoring(false) }
  }

  const progressValue = telemetryStage === TelemetryStage.CLIENT_TX ? 20
    : telemetryStage === TelemetryStage.THINKPAD_GEMMA ? 40
      : telemetryStage === TelemetryStage.MACBOOK_UPLOAD ? 60
        : telemetryStage === TelemetryStage.GEMINI_NEURAL ? 80
          : 100

  const composer = (
    <Composer
      fileInputRef={fileInputRef}
      inputText={inputText}
      isThinking={isThinking || restoring || preparingAttachment}
      onAttachment={() => fileInputRef.current?.click()}
      onCompositionEnd={(text) => {
        if (compositionEndTimerRef.current) clearTimeout(compositionEndTimerRef.current)
        if (submitAfterCompositionRef.current) {
          submitAfterCompositionRef.current = false
          isComposingRef.current = false
          handleSend(text)
          return
        }
        compositionEndTimerRef.current = setTimeout(() => {
          isComposingRef.current = false
          compositionEndTimerRef.current = null
        }, 0)
      }}
      onCompositionStart={() => {
        if (compositionEndTimerRef.current) clearTimeout(compositionEndTimerRef.current)
        compositionEndTimerRef.current = null
        isComposingRef.current = true
      }}
      onFileChange={handleFileChange}
      onInput={setInputText}
      onKeyDown={handleKeyDown}
      onRemoveStaged={removeStaged}
      onSend={() => handleSend()}
      stagedFile={stagedFile}
      stagedImage={stagedImage}
      textareaRef={textareaRef}
    />
  )

  return (
    <div className={styles.appShell} style={viewportStyle}>
      <header className={styles.header}>
        <button aria-label="메뉴 열기" className={styles.iconButton} onClick={() => setMenuOpen(true)} type="button">
          <span className={styles.menuIcon} aria-hidden="true" />
        </button>
        <span className={styles.brand}>Yadut</span>
        <button
          aria-label={activeScreen === 'home' ? '대화로 이동' : '홈으로 이동'}
          className={styles.destinationButton}
          onClick={() => setActiveScreen(activeScreen === 'home' ? 'chat' : 'home')}
          type="button"
        >
          A
        </button>
      </header>

      {conversationError && <p role="alert">{conversationError}</p>}
      {restoring && <p role="status">대화를 불러오는 중입니다.</p>}
      {preparingAttachment && <p role="status">첨부 이미지를 준비하고 있습니다.</p>}
      {activeScreen === 'home' && (
        <main className={`${styles.screen} ${styles.homeScreen}`}>
          <div className={styles.homeContent}>
            <p className={styles.eyebrow}>개인 비서 아르커스</p>
            <h1 className={styles.greeting}>무엇을 함께 살펴볼까요?</h1>
            {composer}
            <div className={styles.suggestions}>
              {['오늘 일정 정리해 줘', '이번 주 할 일 보여줘', '요즘 내 생활 패턴은 어때?'].map((suggestion) => (
                <button key={suggestion} onClick={() => handleSend(suggestion)} type="button">{suggestion}</button>
              ))}
            </div>
            <p className={styles.privacyNote}>당신의 기록을 바탕으로 필요한 맥락을 이어갑니다.</p>
          </div>
        </main>
      )}

      {activeScreen === 'chat' && (
        <main className={`${styles.screen} ${styles.chatScreen}`}>
          <h1 className={styles.threadTitle}>{threadTitle}</h1>
          <div
            aria-label="대화 내용"
            aria-live="polite"
            className={styles.messageFlow}
            onScroll={trackChatPin}
            ref={messageFlowRef}
            role="log"
          >
            {messages.map((message) => <MessageBubble key={message.id} message={message} />)}
            {isThinking && (
              <div className={styles.thinkingContainer}>
                <div className={styles.progressStatusRow} role="status" aria-label={telemetryLog}>
                  <span className={styles.progressSpinner} aria-hidden="true" />
                  <p>{telemetryLog}</p>
                </div>
                <div className={styles.progressTrack} role="progressbar" aria-label="요청 처리 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressValue}>
                  <span style={{ width: `${progressValue}%` }} />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          {composer}
        </main>
      )}

      {activeScreen === 'todos' && <TodoScreen />}
      {activeScreen === 'memory' && <MemoryScreen />}

      <YadutSidebar
        activeScreen={activeScreen}
        historyOpen={historyOpen}
        onClose={() => setMenuOpen(false)}
        onHistoryToggle={() => {
          setHistoryOpen((open) => !open)
          if (!historyOpen) void history.refresh()
        }}
        busy={isThinking || restoring || preparingAttachment}
        conversations={history.conversations}
        loading={history.loading}
        error={history.error}
        onRetry={() => void history.refresh()}
        onNavigate={navigate}
        onNewChat={startNewChat}
        onSelectConversation={selectConversation}
        open={menuOpen}
      />
    </div>
  )
}

type ComposerProps = {
  fileInputRef: React.RefObject<HTMLInputElement | null>
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  inputText: string
  isThinking: boolean
  stagedImage: string | null
  stagedFile: { name: string; type: string } | null
  onInput: (text: string) => void
  onAttachment: () => void
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  onCompositionStart: () => void
  onCompositionEnd: (text: string) => void
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onRemoveStaged: () => void
  onSend: () => void
}

function Composer({
  fileInputRef,
  textareaRef,
  inputText,
  isThinking,
  stagedImage,
  stagedFile,
  onInput,
  onAttachment,
  onFileChange,
  onCompositionStart,
  onCompositionEnd,
  onKeyDown,
  onRemoveStaged,
  onSend,
}: ComposerProps) {
  return (
    <div className={styles.composer}>
      {(stagedImage || stagedFile) && (
        <div className={styles.stagedBar}>
          {stagedImage
            ? <Image alt="첨부 이미지 미리보기" height={48} src={stagedImage} unoptimized width={48} />
            : <span className={styles.fileCard}>문서 · {stagedFile?.name}</span>}
          <button aria-label="첨부 삭제" onClick={onRemoveStaged} type="button">×</button>
        </div>
      )}
      <input className={styles.hiddenInput} ref={fileInputRef} type="file" accept="image/*,application/pdf,text/plain" onChange={onFileChange} />
      <button aria-label="파일 첨부" className={styles.addButton} onClick={onAttachment} type="button">＋</button>
      <textarea
        aria-label="대화 입력"
        className={styles.textField}
        onChange={(event) => onInput(event.target.value)}
        onCompositionEnd={(event) => onCompositionEnd(event.currentTarget.value)}
        onCompositionStart={onCompositionStart}
        onKeyDown={onKeyDown}
        placeholder="아르커스에게 물어보기"
        ref={textareaRef}
        rows={1}
        value={inputText}
      />
      <button
        aria-label="전송"
        className={styles.sendButton}
        disabled={isThinking || (!inputText.trim() && !stagedImage && !stagedFile)}
        onClick={onSend}
        type="button"
      >
        ↑
      </button>
    </div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  return (
    <div className={`${styles.messageRow} ${message.sender === 'user' ? styles.userMessageRow : styles.arcusMessageRow}`}>
      <div className={styles.messageBubble}>
        {message.image && <Image alt="첨부 이미지" className={styles.messageImage} height={240} src={message.image} unoptimized width={320} />}
        {message.file && <div className={styles.fileCard}>{message.attachmentUrl ? <a href={message.attachmentUrl} download>{message.file}</a> : message.file}</div>}
        {message.failure && <p role="alert">{message.failure}</p>}
        {message.text && <p>{message.text}</p>}
      </div>
      {message.time && <time>{message.time}</time>}
    </div>
  )
}

function TodoScreen() {
  return (
    <main className={`${styles.screen} ${styles.featureScreen}`}>
      <p className={styles.eyebrow}>오늘의 흐름</p>
      <h1>투두리스트</h1>
      <p className={styles.featureDescription}>직접 적거나 아르커스와 대화하면 필요한 일이 여기에 모입니다.</p>
      <div className={styles.todoList}>
        {['근무표 캘린더 확인', '이사 견적 비교하기', '저녁 30분 걷기'].map((todo, index) => (
          <label className={styles.todoItem} key={todo}>
            <input defaultChecked={index === 0} type="checkbox" />
            <span>{todo}</span>
          </label>
        ))}
      </div>
      <button className={styles.primaryAction} type="button">＋ 할 일 추가</button>
    </main>
  )
}

function MemoryScreen() {
  const [selected, setSelected] = useState('나')
  const nodes = ['생활', '일정', '관계', '경제']
  return (
    <main className={`${styles.screen} ${styles.featureScreen}`}>
      <p className={styles.eyebrow}>아르커스가 이해한 나</p>
      <h1>기억 설정</h1>
      <p className={styles.featureDescription}>정보를 눌러 연결 관계와 저장된 내용을 확인하고 수정할 수 있습니다.</p>
      <div className={styles.memoryMap}>
        <button className={styles.memoryCenter} onClick={() => setSelected('나')} type="button">나</button>
        {nodes.map((node, index) => (
          <button className={styles[`memoryNode${index + 1}` as keyof typeof styles]} key={node} onClick={() => setSelected(node)} type="button">{node}</button>
        ))}
      </div>
      <section className={styles.memoryDetail}>
        <span>선택한 기억</span>
        <strong>{selected}</strong>
        <p>이 영역에는 저장 근거와 연결된 정보가 표시될 예정입니다.</p>
      </section>
    </main>
  )
}
