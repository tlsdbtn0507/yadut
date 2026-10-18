import { conversationProxy } from '@/server/conversationProxy'
type Context = { params: Promise<{ path?: string[] }> }
export async function GET(request: Request, context: Context) {
  return conversationProxy(request, 'attachments', (await context.params).path ?? [])
}
export const POST = GET
export const PUT = GET
