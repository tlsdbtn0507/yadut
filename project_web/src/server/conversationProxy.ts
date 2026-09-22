import { requireAllowedUser } from '@/auth/requireAllowedUser'
import { getAuthFailure } from '@/auth/routeProtection'

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
const NO_STORE = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }

async function boundedBody(request: Request): Promise<Uint8Array | undefined> {
  if (!request.body) return undefined
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 1024 * 1024) { await reader.cancel(); throw new RangeError('Body too large') }
    chunks.push(value)
  }
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength }
  return body
}

function allowedPath(resource: string, path: string[], method: string): boolean {
  if (!path.every((part) => SAFE_ID.test(part))) return false
  if (path.length === 0) return method === 'GET' && resource === 'conversations' || method === 'POST'
  if (path.length === 1) return method === 'GET' || resource === 'attachments' && method === 'PUT'
  return resource === 'conversations' && path.length === 2 && path[1] === 'messages' && method === 'POST'
}

export async function conversationProxy(request: Request, resource: 'conversations' | 'attachments', path: string[]) {
  const authFailure = getAuthFailure(await requireAllowedUser())
  if (authFailure) return Response.json(authFailure.body, { status: authFailure.status, headers: NO_STORE })
  if (!allowedPath(resource, path, request.method)) return Response.json({ error: 'Not found' }, { status: 404, headers: NO_STORE })
  try {
    const base = process.env.THINKPAD_FUNNEL_URL
    const token = process.env.THINKPAD_BRIDGE_TOKEN
    if (!base || !token) throw new Error('Bridge unavailable')
    const url = new URL(`${base.replace(/\/$/, '')}/api/${resource}${path.length ? '/' + path.join('/') : ''}`)
    if (resource === 'attachments' && request.method === 'PUT') {
      const offset = new URL(request.url).searchParams.get('offset') ?? '0'
      if (!/^\d{1,9}$/.test(offset)) return Response.json({ error: 'Invalid offset' }, { status: 422, headers: NO_STORE })
      url.searchParams.set('offset', offset)
    }
    const body = request.method === 'GET' ? undefined : await boundedBody(request)
    const upstream = await fetch(url.toString(), {
      method: request.method, cache: 'no-store', redirect: 'error',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': request.method === 'PUT' ? 'application/octet-stream' : 'application/json' },
      body: body as BodyInit | undefined,
    })
    if (!upstream.ok) return Response.json({ error: '요청을 처리하지 못했습니다.' }, { status: upstream.status, headers: NO_STORE })
    const headers = new Headers(NO_STORE)
    for (const key of ['Content-Type', 'Content-Disposition', 'Content-Security-Policy']) {
      const value = upstream.headers.get(key)
      if (value) headers.set(key, value)
    }
    return new Response(upstream.body, { status: upstream.status, headers })
  } catch (error: unknown) {
    return Response.json({ error: '저장 서버에 연결하지 못했습니다.' }, {
      status: error instanceof RangeError ? 413 : 502, headers: NO_STORE,
    })
  }
}
