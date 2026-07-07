import { isEmailAllowed, parseAllowedEmails } from '@/auth/allowlist'
import { verifyNativeGoogleIdToken } from '@/auth/nativeGoogleToken'
import { issueNativeLoginCode } from '@/auth/nativeLoginCode'

type NativeAuthExchangeRequest = {
  idToken?: unknown
}

export async function POST(request: Request): Promise<Response> {
  const body = await readJsonBody(request)
  const idToken = readNonEmptyString(body.idToken)

  if (idToken === null) {
    return Response.json({ error: 'missing_id_token' }, { status: 400 })
  }

  const verifiedToken = await verifyNativeGoogleIdToken(
    idToken,
    process.env.GOOGLE_IOS_SERVER_CLIENT_ID ?? process.env.AUTH_GOOGLE_ID,
  )

  if (!verifiedToken.ok) {
    const status = verifiedToken.error === 'missing_audience' ? 500 : 401
    return Response.json(
      {
        error:
          verifiedToken.error === 'missing_audience'
            ? 'missing_google_audience'
            : 'invalid_google_token',
      },
      { status },
    )
  }

  const allowed = isEmailAllowed(
    verifiedToken.user.email,
    parseAllowedEmails(process.env.AUTH_ALLOWED_EMAILS),
  )

  if (!allowed) {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }

  const loginCode = issueNativeLoginCode({
    ...verifiedToken.user,
    email: verifiedToken.user.email.trim().toLowerCase(),
  })

  return Response.json(loginCode)
}

async function readJsonBody(request: Request): Promise<NativeAuthExchangeRequest> {
  try {
    const body = (await request.json()) as NativeAuthExchangeRequest
    return body && typeof body === 'object' ? body : {}
  } catch {
    return {}
  }
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}
