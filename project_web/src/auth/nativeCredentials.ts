import type { User } from 'next-auth'

import { consumeNativeLoginCode } from './nativeLoginCode'

type NativeGoogleCredentials = Partial<Record<'code', unknown>>

function debugNativeCredentials(message: string, data?: unknown): void {
  if (process.env.NODE_ENV === 'production') {
    return
  }

  if (data === undefined) {
    console.log(`[native-credentials] ${message}`)
    return
  }

  console.log(`[native-credentials] ${message}`, data)
}

export async function authorizeNativeGoogleCredentials(
  credentials: NativeGoogleCredentials | undefined,
  nowOrRequest?: number | Request,
): Promise<User | null> {
  debugNativeCredentials('authorize called', {
    keys: Object.keys(credentials ?? {}),
    codeType: typeof credentials?.code,
    codeLength:
      typeof credentials?.code === 'string' ? credentials.code.length : null,
  })

  const code = readNonEmptyString(credentials?.code)

  if (code === null) {
    debugNativeCredentials('missing code')
    return null
  }

  const user = consumeNativeLoginCode(code, readNow(nowOrRequest))

  if (!user) {
    debugNativeCredentials('code rejected', {
      codeLength: code.length,
      parts: code.split('.').length,
    })
    return null
  }

  debugNativeCredentials('user resolved', {
    email: user.email,
    hasName: Boolean(user.name),
    hasImage: Boolean(user.image),
  })

  return {
    id: user.email,
    email: user.email,
    name: user.name ?? user.email,
    image: user.image ?? null,
  }
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function readNow(value: number | Request | undefined): number {
  return typeof value === 'number' ? value : Date.now()
}
