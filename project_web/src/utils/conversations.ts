export type Conversation = { id: string; title: string; created_at: string; updated_at: string }
export type Attachment = { id: string; kind: string; original_name: string; mime_type: string }
export type SavedMessage = {
  id: string; role: 'user' | 'assistant'; text: string; created_at: string
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'interrupted'
  error_stage?: string | null
  attachments: Attachment[]
  result?: { message?: string; schedules?: unknown } | null
}
export type ConversationDetail = Conversation & { messages: SavedMessage[] }

export async function conversationRequest<T>(path = '', body?: object): Promise<T> {
  const response = await fetch(`/api/conversations${path}`, {
    cache: 'no-store', ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
  if (!response.ok) throw new Error('대화 기록을 불러오거나 저장하지 못했습니다. 다시 시도해 주세요.')
  return response.json() as Promise<T>
}

export function groupConversations(conversations: Conversation[], now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const week = new Date(today)
  week.setDate(week.getDate() - 7)
  const groups = ['오늘', '지난 7일', '이전'].map((label) => ({ label, conversations: [] as Conversation[] }))
  for (const conversation of conversations) {
    const date = new Date(conversation.updated_at)
    groups[date >= today ? 0 : date >= week ? 1 : 2].conversations.push(conversation)
  }
  return groups.filter((group) => group.conversations.length)
}

export async function uploadOriginal(file: File): Promise<string> {
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error('첨부 파일은 20MB 이하만 저장할 수 있습니다.')
  const response = await fetch('/api/attachments', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: file.name, mime_type: file.type, byte_size: file.size }),
  })
  if (!response.ok) throw new Error('첨부 원본을 저장하지 못했습니다.')
  const { id } = await response.json() as { id: string }
  const chunkSize = 512 * 1024
  for (let offset = 0; offset < file.size; offset += chunkSize) {
    const chunk = file.slice(offset, offset + chunkSize)
    let saved = false
    for (let attempt = 0; attempt < 2 && !saved; attempt++) {
      try {
        const result = await fetch(`/api/attachments/${id}?offset=${offset}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: chunk,
        })
        saved = result.ok
      } catch { /* One retry uses the same attachment ID and offset. */ }
    }
    if (!saved) throw new Error('첨부 원본 전송이 중단되었습니다. 다시 첨부해 주세요.')
  }
  return id
}
