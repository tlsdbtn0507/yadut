import type { AllowedUserResult } from './allowlist'

export type AuthFailure = {
  status: 401 | 403
  body: {
    success: false
    error: 'Unauthorized' | 'Forbidden'
  }
}

export function getAuthFailure(result: AllowedUserResult): AuthFailure | null {
  if (result.ok) {
    return null
  }

  return {
    status: result.status,
    body: {
      success: false,
      error: result.code === 'unauthorized' ? 'Unauthorized' : 'Forbidden',
    },
  }
}
