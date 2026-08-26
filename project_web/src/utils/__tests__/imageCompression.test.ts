// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { DEFAULT_IMAGE_COMPRESSION, validateImageFile } from '../imageCompression'

describe('imageCompression', () => {
  it('uses stable JPEG compression defaults for mobile uploads', () => {
    expect(DEFAULT_IMAGE_COMPRESSION).toEqual({
      maxDimension: 1600,
      mimeType: 'image/jpeg',
      quality: 0.82,
    })
  })

  it('rejects non-image files before compression starts', () => {
    const file = new File(['hello'], 'note.txt', { type: 'text/plain' })

    expect(() => validateImageFile(file)).toThrow('IMAGE_COMPRESS_FAILED')
  })
})
