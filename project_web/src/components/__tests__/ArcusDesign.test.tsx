import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ArcusConsole from '../ArcusConsole'

describe('ArcusConsole B design', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
    global.fetch = vi.fn().mockResolvedValue(Response.json({
      authenticated: true,
      transport: 'bff_pending',
    })) as typeof fetch
  })

  afterEach(() => {
    cleanup()
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('opens on the Clear Intelligence home without internal server status', () => {
    render(<ArcusConsole />)

    expect(screen.getByRole('heading', { name: '무엇을 함께 살펴볼까요?' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('아르커스에게 물어보기')).toBeInTheDocument()
    expect(screen.queryByText(/ARCUS CORE|BFF AUTH|CHECKING AUTH/)).not.toBeInTheDocument()
  })

  it('shows grouped saved conversations in the existing sidebar design', async () => {
    const today = new Date().toISOString()
    const earlier = new Date(Date.now() - 2 * 86400000).toISOString()
    global.fetch = vi.fn(async () => Response.json([
      { id: 'one', title: '9월 근무표 캘린더 등록', created_at: today, updated_at: today },
      { id: 'two', title: '지난달 소비 흐름 요약', created_at: earlier, updated_at: earlier },
    ])) as typeof fetch
    render(<ArcusConsole />)

    fireEvent.click(screen.getByRole('button', { name: '메뉴 열기' }))
    fireEvent.click(screen.getByRole('button', { name: '이전 대화 펼치기' }))

    expect(await screen.findByText('오늘')).toBeInTheDocument()
    expect(screen.getByText('지난 7일')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '9월 근무표 캘린더 등록' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '지난달 소비 흐름 요약' })).toBeInTheDocument()
  })

  it('navigates to the todo and memory design screens', () => {
    render(<ArcusConsole />)

    fireEvent.click(screen.getByRole('button', { name: '메뉴 열기' }))
    fireEvent.click(screen.getByRole('button', { name: '투두리스트' }))
    expect(screen.getByRole('heading', { name: '투두리스트' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '메뉴 열기' }))
    fireEvent.click(screen.getByRole('button', { name: '기억 설정' }))
    expect(screen.getByRole('heading', { name: '기억 설정' })).toBeInTheDocument()
  })
})
