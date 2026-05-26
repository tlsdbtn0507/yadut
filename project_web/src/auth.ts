import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'

import { isEmailAllowed, parseAllowedEmails } from './auth/allowlist'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  callbacks: {
    signIn({ user }) {
      const allowed = isEmailAllowed(
        user.email,
        parseAllowedEmails(process.env.AUTH_ALLOWED_EMAILS),
      )

      return allowed ? true : '/?auth=forbidden'
    },
  },
})
