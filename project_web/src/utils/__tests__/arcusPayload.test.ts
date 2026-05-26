// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { buildArcusPayload } from '../arcusPayload'

describe('buildArcusPayload', () => {
  it('builds a text-only payload', () => {
    expect(buildArcusPayload({ text: '안녕', imageDataUrl: null })).toEqual({
      text: '안녕',
      attachment_type: null,
      attachment_data: null,
      attachment_name: 'upload.jpg',
      message_id: expect.stringMatching(/^web-\d+$/),
    })
  })

  it('strips data URL metadata for image payloads', () => {
    expect(
      buildArcusPayload({
        text: '이 이미지 봐줘',
        imageDataUrl: 'data:image/png;base64,ABC123',
        messageId: 'client-1',
      }),
    ).toEqual({
      text: '이 이미지 봐줘',
      attachment_type: 'image',
      attachment_data: 'ABC123',
      attachment_name: 'upload.jpg',
      message_id: 'client-1',
    })
  })
})
