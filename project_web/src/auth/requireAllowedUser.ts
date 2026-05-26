import { auth } from '@/auth'

import {
  type AllowedUserResult,
  getAllowedUser,
  parseAllowedEmails,
} from './allowlist'

export async function requireAllowedUser(): Promise<AllowedUserResult> {
  const session = await auth()

  return getAllowedUser(
    session?.user ?? null,
    parseAllowedEmails(process.env.AUTH_ALLOWED_EMAILS),
  )
}
