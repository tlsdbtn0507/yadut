// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/auth', () => ({
  signIn: vi.fn(async () => undefined),
}))

import { signIn } from '@/auth'

import NativeLoginPage from '../page'

describe('/native-login page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('signs in with the native-google provider and redirects to the console', async () => {
    const element = await NativeLoginPage({
      searchParams: Promise.resolve({
        code: 'one-time-code',
      }),
    })

    expect(signIn).toHaveBeenCalledWith('native-google', {
      code: 'one-time-code',
      redirectTo: '/',
    })
    expect(JSON.stringify(element)).toContain('ARCUS 세션 연결 중')
  })

  it('shows an error state when the native login code is missing', async () => {
    const element = await NativeLoginPage({
      searchParams: Promise.resolve({}),
    })

    expect(signIn).not.toHaveBeenCalled()
    expect(JSON.stringify(element)).toContain('로그인 코드 없음')
  })
})
