import { randomUUID } from 'crypto'

export const NATIVE_LOGIN_CODE_EXPIRES_IN_SECONDS = 180

export type NativeLoginUser = {
  email: string
  name?: string | null
  image?: string | null
}

type NativeLoginCodeRecord = {
  user: NativeLoginUser
  expiresAt: number
}

const nativeLoginCodes = new Map<string, NativeLoginCodeRecord>()

export function issueNativeLoginCode(
  user: NativeLoginUser,
  now: number = Date.now(),
): { code: string; expiresInSeconds: number } {
  const code = randomUUID()
  nativeLoginCodes.set(code, {
    user,
    expiresAt: now + NATIVE_LOGIN_CODE_EXPIRES_IN_SECONDS * 1000,
  })

  return {
    code,
    expiresInSeconds: NATIVE_LOGIN_CODE_EXPIRES_IN_SECONDS,
  }
}

export function consumeNativeLoginCode(
  code: string,
  now: number = Date.now(),
): NativeLoginUser | null {
  const record = nativeLoginCodes.get(code)
  nativeLoginCodes.delete(code)

  if (!record || record.expiresAt <= now) {
    return null
  }

  return record.user
}

export function __resetNativeLoginCodes(): void {
  nativeLoginCodes.clear()
}
