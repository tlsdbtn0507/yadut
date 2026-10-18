import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ArcusConsole from '../ArcusConsole'

const conversation = { id: 'saved', title: '저장한 대화', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }

describe('saved conversations', () => {
  beforeEach(() => { Element.prototype.scrollIntoView = vi.fn() })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it('lists and restores a conversation through the BFF', async () => {
    const fetcher = vi.fn(async (url: string) => Response.json(url.endsWith('/saved')
      ? { ...conversation, messages: [{ id: 'original-id', role: 'user', text: '원본 내용', created_at: conversation.created_at, status: 'completed', attachments: [] }] }
      : [conversation]))
    vi.stubGlobal('fetch', fetcher)
    render(<ArcusConsole />)
    fireEvent.click(screen.getByRole('button', { name: '이전 대화 펼치기' }))
    fireEvent.click(await screen.findByRole('button', { name: '저장한 대화' }))
    expect(await screen.findByText('원본 내용')).toBeInTheDocument()
    expect(fetcher).toHaveBeenCalledWith('/api/conversations/saved', expect.objectContaining({ cache: 'no-store' }))
  })

  it('shows an empty history', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json([])))
    render(<ArcusConsole />)
    fireEvent.click(screen.getByRole('button', { name: '이전 대화 펼치기' }))
    expect(await screen.findByText('저장된 대화가 없습니다.')).toBeInTheDocument()
  })

  it('creates a conversation before the home first message with a stable message ID', async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/conversations' && init?.method === 'POST') return Response.json(conversation)
      if (url.endsWith('/stream')) return new Response('event: completed\ndata: {"type":"completed","message":"답변","assistant_message_id":"assistant-id"}\n\n')
      return Response.json([])
    })
    vi.stubGlobal('fetch', fetcher)
    render(<ArcusConsole />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '첫 질문' } })
    fireEvent.click(screen.getByRole('button', { name: '전송' }))
    expect(await screen.findByText('답변')).toBeInTheDocument()
    const call = fetcher.mock.calls.find(([url]) => url.endsWith('/stream'))
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ conversation_id: 'saved', text: '첫 질문', message_id: expect.any(String) })
  })

  it('creates an empty conversation with the new chat button', async () => {
    const fetcher = vi.fn(async () => Response.json(conversation))
    vi.stubGlobal('fetch', fetcher)
    render(<ArcusConsole />)
    fireEvent.click(screen.getByRole('button', { name: /새 대화/ }))
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith('/api/conversations', expect.objectContaining({ method: 'POST' })))
  })
})

it('shows a failed history request and allows retry', async () => {
  Element.prototype.scrollIntoView = vi.fn()
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 502 }))
    .mockResolvedValueOnce(Response.json([]))
  vi.stubGlobal('fetch', fetcher)
  const view = render(<ArcusConsole />)
  fireEvent.click(screen.getByRole('button', { name: '이전 대화 펼치기' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('대화 기록을 불러오지 못했습니다.')
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
  expect(await screen.findByText('저장된 대화가 없습니다.')).toBeInTheDocument()
  view.unmount()
  vi.unstubAllGlobals()
})
