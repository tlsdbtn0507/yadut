// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/auth/requireAllowedUser', () => ({
  requireAllowedUser: vi.fn(async () => ({
    ok: true,
    email: 'me@gmail.com',
  })),
}))

import { GET } from '../route'

describe('/api/runtime-config', () => {
  it('does not expose ThinkPad WebSocket URL or bridge token', async () => {
    const response = await GET()
    const body = await response.json()

    expect(body).toEqual({
      authenticated: true,
      transport: 'bff_pending',
    })
    expect(body).not.toHaveProperty('thinkpadWsUrl')
    expect(body).not.toHaveProperty('wsToken')
  })
})
