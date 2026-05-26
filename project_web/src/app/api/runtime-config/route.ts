import { NextResponse } from 'next/server'

import { requireAllowedUser } from '@/auth/requireAllowedUser'
import { getAuthFailure } from '@/auth/routeProtection'

export async function GET() {
  const authFailure = getAuthFailure(await requireAllowedUser())

  if (authFailure) {
    return NextResponse.json(authFailure.body, { status: authFailure.status })
  }

  return NextResponse.json({
    authenticated: true,
    transport: 'bff_pending',
  })
}
