export type ArcusPayload = {
  text: string
  attachment_type: 'image' | null
  attachment_data: string | null
  attachment_mime: 'image/jpeg' | null
  attachment_name: string
  conversation_id?: string
  attachment_ids?: string[]
  message_id: string
}

export function buildArcusPayload({
  text,
  imageDataUrl,
  messageId = crypto.randomUUID(),
  conversationId,
  attachmentIds,
}: {
  text: string
  imageDataUrl?: string | null
  messageId?: string
  conversationId?: string
  attachmentIds?: string[]
}): ArcusPayload {
  const attachmentData = imageDataUrl ? stripDataUrlPrefix(imageDataUrl) : null

  return {
    text,
    ...(conversationId ? { conversation_id: conversationId } : {}),
    ...(attachmentIds ? { attachment_ids: attachmentIds } : {}),
    attachment_type: attachmentData ? 'image' : null,
    attachment_data: attachmentData,
    attachment_mime: attachmentData ? 'image/jpeg' : null,
    attachment_name: 'upload.jpg',
    message_id: messageId,
  }
}

function stripDataUrlPrefix(value: string): string {
  const parts = value.split(',')

  return parts.length > 1 ? parts[1] : parts[0]
}
