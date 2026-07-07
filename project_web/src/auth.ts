import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'

import { isEmailAllowed, parseAllowedEmails } from './auth/allowlist'
import { authorizeNativeGoogleCredentials } from './auth/nativeCredentials'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google,
    Credentials({
      id: 'native-google',
      name: 'Native Google',
      credentials: {
        code: {},
      },
      authorize: authorizeNativeGoogleCredentials,
    }),
  ],
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
