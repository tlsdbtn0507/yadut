// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/auth/requireAllowedUser', () => ({ requireAllowedUser: vi.fn(async () => ({ ok: true, email: 'local@example.com' })) }))
import { requireAllowedUser } from '@/auth/requireAllowedUser'
import { conversationProxy } from '../conversationProxy'

describe('private conversation BFF', () => {
  beforeEach(() => {
    vi.stubEnv('THINKPAD_FUNNEL_URL', 'https://private.example')
    vi.stubEnv('THINKPAD_BRIDGE_TOKEN', 'private-token')
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks() })

  it('requires authentication before contacting ThinkPad', async () => {
    vi.mocked(requireAllowedUser).mockResolvedValueOnce({ ok: false, status: 401, code: 'unauthorized' })
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    expect((await conversationProxy(new Request('http://localhost/api/conversations'), 'conversations', [])).status).toBe(401)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('uses the server token and disables caching without returning secrets', async () => {
    const fetcher = vi.fn(async () => Response.json([{ id: 'c1' }]))
    vi.stubGlobal('fetch', fetcher)
    const response = await conversationProxy(new Request('http://localhost/api/conversations'), 'conversations', [])
    expect(await response.json()).toEqual([{ id: 'c1' }])
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(fetcher).toHaveBeenCalledWith('https://private.example/api/conversations', expect.objectContaining({
      cache: 'no-store', headers: expect.objectContaining({ Authorization: 'Bearer private-token' }),
    }))
  })

  it('blocks path traversal and sanitizes upstream errors', async () => {
    const fetcher = vi.fn(async () => new Response('private-token private.example', { status: 404 }))
    vi.stubGlobal('fetch', fetcher)
    expect((await conversationProxy(new Request('http://localhost/api/conversations'), 'conversations', ['..'])).status).toBe(404)
    expect(fetcher).not.toHaveBeenCalled()
    const response = await conversationProxy(new Request('http://localhost/api/conversations/missing'), 'conversations', ['missing'])
    expect(response.status).toBe(404)
    expect(await response.text()).not.toContain('private')
  })
})
