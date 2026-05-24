import { NextResponse } from 'next/server'

// MacBook actual endpoint URL
const MACBOOK_URL = 'http://100.84.129.54:8000'

export async function POST() {
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

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to connect to MacBook server'
    }, { status: 500 })
  }
}
