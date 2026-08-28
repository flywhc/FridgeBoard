/** 自定义小类图标的前端解码、尺寸规划和 PNG 转换。 */

export const ICON_IMAGE_MAX_BYTES = 10 * 1024 * 1024
export const ICON_IMAGE_MAX_PIXELS = 16_000_000
export const ICON_IMAGE_MAX_DIMENSION = 256

export type PreparedIconImage = {
  file: File
  width: number
  height: number
}

/** 图标图片无法在前端安全读取或转换时使用的错误类型。 */
export class IconImageProcessingError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'IconImageProcessingError'
  }
}

type DecodedIconImage = {
  source: CanvasImageSource
  width: number
  height: number
  close: () => void
}

async function decodeIconImage(file: Blob): Promise<DecodedIconImage> {
  if (typeof globalThis.createImageBitmap === 'function') {
    try {
      const bitmap = await globalThis.createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
    } catch {
      // 回退到 HTMLImageElement，兼容不支持 imageOrientation 选项的 WebView。
    }
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new IconImageProcessingError('图片加载失败'))
      image.src = objectUrl
    })
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(objectUrl),
    }
  } catch (error) {
    URL.revokeObjectURL(objectUrl)
    if (error instanceof IconImageProcessingError) throw error
    throw new IconImageProcessingError('无法读取图片', { cause: error })
  }
}

function getIconImageSize(width: number, height: number): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new IconImageProcessingError('图片尺寸无效')
  }
  if (width * height > ICON_IMAGE_MAX_PIXELS) {
    throw new IconImageProcessingError('图片像素数量超过 16MP 限制')
  }
  const scale = Math.min(1, ICON_IMAGE_MAX_DIMENSION / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new IconImageProcessingError('无法转换图片'))
        return
      }
      resolve(blob)
    }, 'image/png')
  })
}

/** 将本地图片等比转换为图标资源使用的 PNG 尺寸。 */
export async function prepareIconImage(file: File): Promise<PreparedIconImage> {
  if (file.size > ICON_IMAGE_MAX_BYTES) throw new IconImageProcessingError('图片超过 10MB 限制')
  const decoded = await decodeIconImage(file)
  try {
    const size = getIconImageSize(decoded.width, decoded.height)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext('2d')
    if (!context) throw new IconImageProcessingError('无法准备图片转换画布')
    context.drawImage(decoded.source, 0, 0, size.width, size.height)
    const blob = await canvasToPng(canvas)
    if (blob.size > ICON_IMAGE_MAX_BYTES) throw new IconImageProcessingError('转换后的图片超过 10MB 限制')
    return {
      file: new File([blob], 'icon.png', { type: 'image/png' }),
      ...size,
    }
  } catch (error) {
    if (error instanceof IconImageProcessingError) throw error
    throw new IconImageProcessingError('图片转换失败，请重试。', { cause: error })
  } finally {
    decoded.close()
  }
}
