import { useCallback, useState } from 'react'
import { type Conversation, conversationRequest } from '../utils/conversations'

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try { setConversations(await conversationRequest<Conversation[]>()) }
    catch { setError('대화 기록을 불러오지 못했습니다.') }
    finally { setLoading(false) }
  }, [])
  return { conversations, loading, error, refresh }
}
