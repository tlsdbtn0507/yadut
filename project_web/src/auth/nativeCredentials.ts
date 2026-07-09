import type { User } from 'next-auth'

import { consumeNativeLoginCode } from './nativeLoginCode'

type NativeGoogleCredentials = Partial<Record<'code', unknown>>

export async function authorizeNativeGoogleCredentials(
  credentials: NativeGoogleCredentials | undefined,
  nowOrRequest?: number | Request,
): Promise<User | null> {
  const code = readNonEmptyString(credentials?.code)

  if (code === null) {
    return null
  }

  const user = consumeNativeLoginCode(code, readNow(nowOrRequest))

  if (!user) {
    return null
  }

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
