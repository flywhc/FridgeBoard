/** 自定义小类图标的前端解码、尺寸规划和 PNG 转换。 */

import { removeLightBackground } from './iconBackgroundRemoval'

export const ICON_IMAGE_MAX_BYTES = 10 * 1024 * 1024
export const ICON_IMAGE_MAX_PIXELS = 16_000_000
export const ICON_IMAGE_MAX_DIMENSION = 256
const ICON_IMAGE_ANALYSIS_MAX_DIMENSION = 1024

export type PreparedIconImage = {
  file: File
  originalFile?: File
  width: number
  height: number
  backgroundRemoved: boolean
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

function getIconImageSize(width: number, height: number, maxDimension = ICON_IMAGE_MAX_DIMENSION): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new IconImageProcessingError('图片尺寸无效')
  }
  if (width * height > ICON_IMAGE_MAX_PIXELS) {
    throw new IconImageProcessingError('图片像素数量超过 16MP 限制')
  }
  const scale = Math.min(1, maxDimension / Math.max(width, height))
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

function createCanvas(width: number, height: number): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new IconImageProcessingError('无法准备图片转换画布')
  return { canvas, context }
}

/** 将本地图片移除可信浅色背景后，等比转换为图标资源使用的 PNG 尺寸。 */
export async function prepareIconImage(file: File): Promise<PreparedIconImage> {
  if (file.size > ICON_IMAGE_MAX_BYTES) throw new IconImageProcessingError('图片超过 10MB 限制')
  const decoded = await decodeIconImage(file)
  try {
    const size = getIconImageSize(decoded.width, decoded.height)
    const analysisSize = getIconImageSize(decoded.width, decoded.height, ICON_IMAGE_ANALYSIS_MAX_DIMENSION)
    const analysis = createCanvas(analysisSize.width, analysisSize.height)
    analysis.context.drawImage(decoded.source, 0, 0, analysisSize.width, analysisSize.height)
    const imageData = analysis.context.getImageData(0, 0, analysisSize.width, analysisSize.height)
    const removal = removeLightBackground({ width: analysisSize.width, height: analysisSize.height, data: imageData.data })
    const output = createCanvas(size.width, size.height)

    if (removal.backgroundRemoved) {
      imageData.data.set(removal.data)
      analysis.context.putImageData(imageData, 0, 0)
      output.context.drawImage(analysis.canvas, 0, 0, size.width, size.height)
    } else {
      output.context.drawImage(decoded.source, 0, 0, size.width, size.height)
    }
    const blob = await canvasToPng(output.canvas)
    if (blob.size > ICON_IMAGE_MAX_BYTES) throw new IconImageProcessingError('转换后的图片超过 10MB 限制')
    let originalFile: File | undefined
    if (removal.backgroundRemoved) {
      output.context.clearRect(0, 0, size.width, size.height)
      output.context.drawImage(decoded.source, 0, 0, size.width, size.height)
      const originalBlob = await canvasToPng(output.canvas)
      if (originalBlob.size > ICON_IMAGE_MAX_BYTES) throw new IconImageProcessingError('转换后的原图超过 10MB 限制')
      originalFile = new File([originalBlob], 'icon-original.png', { type: 'image/png' })
    }
    return {
      file: new File([blob], 'icon.png', { type: 'image/png' }),
      originalFile,
      backgroundRemoved: removal.backgroundRemoved,
      ...size,
    }
  } catch (error) {
    if (error instanceof IconImageProcessingError) throw error
    throw new IconImageProcessingError('图片转换失败，请重试。', { cause: error })
  } finally {
    decoded.close()
  }
}
