import { createHmac, randomUUID, timingSafeEqual } from 'crypto'

export const NATIVE_LOGIN_CODE_EXPIRES_IN_SECONDS = 180

export type NativeLoginUser = {
  email: string
  name?: string | null
  image?: string | null
}

type NativeLoginCodeRecord = {
  email: string
  name?: string | null
  iat: number
  exp: number
  nonce: string
}

export function issueNativeLoginCode(
  user: NativeLoginUser,
  now: number = Date.now(),
): { code: string; expiresInSeconds: number } {
  const payload: NativeLoginCodeRecord = {
    email: user.email,
    name: user.name ?? null,
    iat: now,
    exp: now + NATIVE_LOGIN_CODE_EXPIRES_IN_SECONDS * 1000,
    nonce: randomUUID(),
  }
  const encodedPayload = encodeBase64Url(JSON.stringify(payload))
  const signature = sign(encodedPayload)

  return {
    code: `${encodedPayload}.${signature}`,
    expiresInSeconds: NATIVE_LOGIN_CODE_EXPIRES_IN_SECONDS,
  }
}

export function consumeNativeLoginCode(
  code: string,
  now: number = Date.now(),
): NativeLoginUser | null {
  const [encodedPayload, signature, ...extraParts] = code.split('.')

  if (!encodedPayload || !signature || extraParts.length > 0) {
    return null
  }

  if (!isValidSignature(encodedPayload, signature)) {
    return null
  }

  const payload = decodePayload(encodedPayload)

  if (!payload || payload.exp <= now) {
    return null
  }

  return {
    email: payload.email,
    name: payload.name ?? payload.email,
    image: null,
  }
}

export function __resetNativeLoginCodes(): void {
  // Kept as a no-op test helper so older tests can reset either implementation.
}

function sign(encodedPayload: string): string {
  return createHmac('sha256', getSigningSecret())
    .update(encodedPayload)
    .digest('base64url')
}

function isValidSignature(encodedPayload: string, signature: string): boolean {
  const expected = sign(encodedPayload)
  const expectedBuffer = Buffer.from(expected)
  const actualBuffer = Buffer.from(signature)

  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  )
}

function getSigningSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim()

  if (!secret) {
    throw new Error('AUTH_SECRET is required to issue native login codes.')
  }

  return secret
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function decodePayload(encodedPayload: string): NativeLoginCodeRecord | null {
  try {
    const rawPayload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as Partial<NativeLoginCodeRecord>

    if (
      typeof rawPayload.email !== 'string' ||
      rawPayload.email.trim() === '' ||
      typeof rawPayload.iat !== 'number' ||
      typeof rawPayload.exp !== 'number' ||
      typeof rawPayload.nonce !== 'string'
    ) {
      return null
    }

    return {
      email: rawPayload.email.trim().toLowerCase(),
      name:
        typeof rawPayload.name === 'string' && rawPayload.name.trim()
          ? rawPayload.name.trim()
          : null,
      iat: rawPayload.iat,
      exp: rawPayload.exp,
      nonce: rawPayload.nonce,
    }
  } catch {
    return null
  }
}
