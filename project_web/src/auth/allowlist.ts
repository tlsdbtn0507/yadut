export type SessionUser = {
  email?: string | null
}

export type AllowedUserResult =
  | {
      ok: true
      email: string
    }
  | {
      ok: false
      status: 401 | 403
      code: 'unauthorized' | 'forbidden'
    }

export function parseAllowedEmails(value: string | undefined): Set<string> {
  if (!value) {
    return new Set()
  }

  return new Set(
    value
      .split(',')
      .map(normalizeEmail)
      .filter((email): email is string => email !== null),
  )
}

export function isEmailAllowed(
  email: string | null | undefined,
  allowedEmails: ReadonlySet<string>,
): boolean {
  const normalized = normalizeEmail(email)

  return normalized !== null && allowedEmails.has(normalized)
}

export function getAllowedUser(
  user: SessionUser | null | undefined,
  allowedEmails: ReadonlySet<string>,
): AllowedUserResult {
  const normalized = normalizeEmail(user?.email)

  if (normalized === null) {
    return {
      ok: false,
      status: 401,
      code: 'unauthorized',
    }
  }

  if (!allowedEmails.has(normalized)) {
    return {
      ok: false,
      status: 403,
      code: 'forbidden',
    }
  }

  return {
    ok: true,
    email: normalized,
  }
}

function normalizeEmail(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase()

  return normalized ? normalized : null
}
