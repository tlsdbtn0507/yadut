export type ImageCompressionOptions = {
  maxDimension: number
  mimeType: 'image/jpeg'
  quality: number
}

export type CompressedImage = {
  dataUrl: string
  mimeType: 'image/jpeg'
}

export const DEFAULT_IMAGE_COMPRESSION: ImageCompressionOptions = {
  maxDimension: 1600,
  mimeType: 'image/jpeg',
  quality: 0.82,
}

export class ImageCompressionError extends Error {
  constructor(message = 'IMAGE_COMPRESS_FAILED') {
    super(message)
    this.name = 'ImageCompressionError'
  }
}

export function validateImageFile(file: File): void {
  if (!file.type.startsWith('image/')) {
    throw new ImageCompressionError()
  }
}

export async function compressImageFile(
  file: File,
  options: ImageCompressionOptions = DEFAULT_IMAGE_COMPRESSION,
): Promise<CompressedImage> {
  validateImageFile(file)

  const image = await loadImage(file)
  const { width, height } = getScaledDimensions(
    image.naturalWidth,
    image.naturalHeight,
    options.maxDimension,
  )
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) {
    throw new ImageCompressionError()
  }

  context.drawImage(image, 0, 0, width, height)

  return {
    dataUrl: canvas.toDataURL(options.mimeType, options.quality),
    mimeType: options.mimeType,
  }
}

function getScaledDimensions(
  originalWidth: number,
  originalHeight: number,
  maxDimension: number,
): { width: number; height: number } {
  const largestSide = Math.max(originalWidth, originalHeight)
  if (largestSide <= maxDimension) {
    return { width: originalWidth, height: originalHeight }
  }

  const scale = maxDimension / largestSide
  return {
    width: Math.round(originalWidth * scale),
    height: Math.round(originalHeight * scale),
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)

    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new ImageCompressionError())
    }
    image.src = objectUrl
  })
}
