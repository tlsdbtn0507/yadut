import { conversationProxy } from '@/server/conversationProxy'
type Context = { params: Promise<{ path?: string[] }> }
export async function GET(request: Request, context: Context) {
  return conversationProxy(request, 'conversations', (await context.params).path ?? [])
}
export const POST = GET
