import { NextResponse } from 'next/server'

import { requireAllowedUser } from '@/auth/requireAllowedUser'
import { getAuthFailure } from '@/auth/routeProtection'

const MACBOOK_URL = process.env.MACBOOK_URL ?? 'http://100.84.129.54:8000'

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Failed to connect to MacBook server'
}

export async function POST() {
  const authFailure = getAuthFailure(await requireAllowedUser())

  if (authFailure) {
    return NextResponse.json(authFailure.body, { status: authFailure.status })
  }

  try {
    // 1. Direct GET request to physical MacBook server (completely bypassing browser CORS check)
    const response = await fetch(`${MACBOOK_URL}/capture`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`MacBook returned ${response.status}`)
    }

    const data = await response.json()
    
    // 2. Format response mapping the screenshot filename to accessible MacBook URL
    if (data.status === 'success') {
      return NextResponse.json({
        success: true,
        imageUrl: `${MACBOOK_URL}/download/${data.filename}`
      })
    }

    return NextResponse.json({
      success: false,
      error: data.message || 'Capture failed'
    })

  } catch (error: unknown) {
    return NextResponse.json({
      success: false,
      error: getErrorMessage(error)
    }, { status: 500 })
  }
}
