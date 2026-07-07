export type NativeGoogleUser = {
  email: string
  name?: string | null
  image?: string | null
}

export type NativeGoogleTokenResult =
  | {
      ok: true
      user: NativeGoogleUser
    }
  | {
      ok: false
      error: 'missing_audience' | 'invalid_google_token'
    }

type GoogleTokenInfo = {
  aud?: unknown
  email?: unknown
  email_verified?: unknown
  name?: unknown
  picture?: unknown
}

export async function verifyNativeGoogleIdToken(
  idToken: string,
  expectedAudience: string | undefined,
): Promise<NativeGoogleTokenResult> {
  if (!expectedAudience) {
    return {
      ok: false,
      error: 'missing_audience',
    }
  }

  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
  )

  if (!response.ok) {
    return {
      ok: false,
      error: 'invalid_google_token',
    }
  }

  const tokenInfo = (await response.json()) as GoogleTokenInfo
  const email = readNonEmptyString(tokenInfo.email)
  const audience = readNonEmptyString(tokenInfo.aud)

  if (
    audience !== expectedAudience ||
    email === null ||
    !isEmailVerified(tokenInfo.email_verified)
  ) {
    return {
      ok: false,
      error: 'invalid_google_token',
    }
  }

  return {
    ok: true,
    user: {
      email,
      name: readNonEmptyString(tokenInfo.name),
      image: readNonEmptyString(tokenInfo.picture),
    },
  }
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function isEmailVerified(value: unknown): boolean {
  return value === true || value === 'true'
}
