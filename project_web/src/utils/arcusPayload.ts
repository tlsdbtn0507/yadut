export type ArcusPayload = {
  text: string
  attachment_type: 'image' | null
  attachment_data: string | null
  attachment_mime: 'image/jpeg' | null
  attachment_name: string
  message_id: string
}

export function buildArcusPayload({
  text,
  imageDataUrl,
  messageId = `web-${Date.now()}`,
}: {
  text: string
  imageDataUrl?: string | null
  messageId?: string
}): ArcusPayload {
  const attachmentData = imageDataUrl ? stripDataUrlPrefix(imageDataUrl) : null

  return {
    text,
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
