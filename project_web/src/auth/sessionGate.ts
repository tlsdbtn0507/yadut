import { getAllowedUser, type SessionUser } from './allowlist'

export type SessionGateState =
  | {
      status: 'unauthenticated'
    }
  | {
      status: 'forbidden'
      email: string
    }
  | {
      status: 'authorized'
      email: string
    }

export function getSessionGateState(
  user: SessionUser | null | undefined,
  allowedEmails: ReadonlySet<string>,
): SessionGateState {
  const result = getAllowedUser(user, allowedEmails)

  if (result.ok) {
    return {
      status: 'authorized',
      email: result.email,
    }
  }

  if (result.status === 401) {
    return {
      status: 'unauthenticated',
    }
  }

  return {
    status: 'forbidden',
    email: user?.email?.trim().toLowerCase() ?? '',
  }
}
