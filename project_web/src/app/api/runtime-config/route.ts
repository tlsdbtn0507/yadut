import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    thinkpadWsUrl: process.env.NEXT_PUBLIC_THINKPAD_WS_URL ?? process.env.THINKPAD_WS_URL ?? 'ws://100.122.25.31:8000/ws',
    wsToken: process.env.WS_TOKEN ?? 'SECRET_KEY'
  })
}
