/** P6 识别图片的尺寸规划、格式转换和传输体积控制。 */

export const RECOGNITION_MAX_UPLOAD_BYTES = 512 * 1024
export const RECOGNITION_PRIMARY_JPEG_QUALITY = 0.75
export const RECOGNITION_FALLBACK_JPEG_QUALITY = 0.70
export const RECOGNITION_CAMERA_MAX_DIMENSION = 1920
export const LONG_SCREENSHOT_ASPECT_RATIO = 2.5
export const RECOGNITION_MAX_IMAGE_PIXELS = 12_000_000
export const RECOGNITION_MAX_LONG_SCREENSHOT_HEIGHT = 8192
export const RECOGNITION_MIN_RESIZED_WIDTH = 640
const RECOGNITION_MAX_SIZE_RETRIES = 3

export type RecognitionImageProfile = 'camera' | 'photo' | 'barcode'

export type RecognitionImagePlan = {
  width: number
  height: number
  longScreenshot: boolean
}

export type PreparedRecognitionImage = {
  imageBase64: string
  contentType: 'image/jpeg'
  width: number
  height: number
  byteLength: number
}

/** 图片处理失败时使用的可区分错误类型，避免误显示为相机权限错误。 */
export class RecognitionImageProcessingError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'RecognitionImageProcessingError'
  }
}

/** 图片在可读尺寸下仍超过传输预算时使用的错误类型。 */
export class RecognitionImageTooLargeError extends RecognitionImageProcessingError {
  readonly byteLength: number

  constructor(byteLength: number) {
    super('图片过大，请截取需要识别的部分后重试。')
    this.name = 'RecognitionImageTooLargeError'
    this.byteLength = byteLength
  }
}

/**
 * 根据识别用途规划输出尺寸；订单长截图保持原始宽高，避免缩小纵向文字。
 *
 * @param sourceWidth 原始图片宽度。
 * @param sourceHeight 原始图片高度。
 * @param profile 图片来源或识别用途。
 * @returns 输出图片尺寸和是否按长截图处理。
 */
export function getRecognitionImagePlan(
  sourceWidth: number,
  sourceHeight: number,
  profile: RecognitionImageProfile,
): RecognitionImagePlan {
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
    throw new RecognitionImageProcessingError('图片尺寸无效')
  }
  const longScreenshot = profile === 'photo'
    && sourceHeight > sourceWidth
    && sourceHeight / sourceWidth >= LONG_SCREENSHOT_ASPECT_RATIO
  if (longScreenshot || profile === 'barcode') {
    const scale = longScreenshot
      ? Math.min(
        1,
        RECOGNITION_MAX_LONG_SCREENSHOT_HEIGHT / sourceHeight,
        Math.sqrt(RECOGNITION_MAX_IMAGE_PIXELS / (sourceWidth * sourceHeight)),
      )
      : 1
    return {
      width: Math.max(1, Math.round(sourceWidth * scale)),
      height: Math.max(1, Math.round(sourceHeight * scale)),
      longScreenshot,
    }
  }

  const scale = Math.min(
    1,
    RECOGNITION_CAMERA_MAX_DIMENSION / Math.max(sourceWidth, sourceHeight),
    Math.sqrt(RECOGNITION_MAX_IMAGE_PIXELS / (sourceWidth * sourceHeight)),
  )
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
    longScreenshot: false,
  }
}

/** 返回按输出大小尝试的 JPEG 质量，扫码只保留原有单档编码。 */
export function getRecognitionJpegQualities(profile: RecognitionImageProfile): number[] {
  return profile === 'barcode'
    ? [0.82]
    : [RECOGNITION_PRIMARY_JPEG_QUALITY, RECOGNITION_FALLBACK_JPEG_QUALITY]
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new RecognitionImageProcessingError('无法压缩图片'))
    }, 'image/jpeg', quality)
  })
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      const separator = result.indexOf(',')
      if (separator < 0) {
        reject(new RecognitionImageProcessingError('图片编码结果无效'))
        return
      }
      resolve(result.slice(separator + 1))
    }
    reader.onerror = () => reject(new RecognitionImageProcessingError('无法读取压缩图片'))
    reader.readAsDataURL(blob)
  })
}

type DecodedImage = {
  source: CanvasImageSource
  width: number
  height: number
  close: () => void
}

async function decodeImage(file: Blob): Promise<DecodedImage> {
  if (typeof globalThis.createImageBitmap === 'function') {
    try {
      const bitmap = await globalThis.createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
    } catch {
      // Fall back to HTMLImageElement for browsers that do not support this bitmap option.
    }
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new RecognitionImageProcessingError('图片加载失败'))
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
    throw new RecognitionImageProcessingError('无法读取图片', { cause: error })
  }
}

function resizePlan(plan: RecognitionImagePlan, byteLength: number): RecognitionImagePlan | null {
  const sizeRatio = Math.sqrt(RECOGNITION_MAX_UPLOAD_BYTES / byteLength)
  const scale = Math.min(0.85, Math.max(0.5, sizeRatio * 0.95))
  const width = Math.max(RECOGNITION_MIN_RESIZED_WIDTH, Math.round(plan.width * scale))
  if (width >= plan.width) return null
  const height = Math.max(1, Math.round(plan.height * (width / plan.width)))
  return { width, height, longScreenshot: plan.longScreenshot }
}

async function renderRecognitionImage(
  source: CanvasImageSource,
  plan: RecognitionImagePlan,
  profile: RecognitionImageProfile,
): Promise<PreparedRecognitionImage> {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = plan.width
    canvas.height = plan.height
    const context = canvas.getContext('2d')
    if (!context) throw new RecognitionImageProcessingError('无法准备图片压缩画布')
    context.drawImage(source, 0, 0, plan.width, plan.height)

    let selectedBlob: Blob | undefined
    for (const quality of getRecognitionJpegQualities(profile)) {
      const blob = await canvasToJpeg(canvas, quality)
      selectedBlob = blob
      if (profile === 'barcode' || blob.size <= RECOGNITION_MAX_UPLOAD_BYTES) break
    }
    if (!selectedBlob) throw new RecognitionImageProcessingError('无法压缩图片')
    if (profile !== 'barcode' && selectedBlob.size > RECOGNITION_MAX_UPLOAD_BYTES) {
      throw new RecognitionImageTooLargeError(selectedBlob.size)
    }

    return {
      imageBase64: await blobToBase64(selectedBlob),
      contentType: 'image/jpeg',
      width: plan.width,
      height: plan.height,
      byteLength: selectedBlob.size,
    }
  } catch (error) {
    if (error instanceof RecognitionImageProcessingError) throw error
    throw new RecognitionImageProcessingError('图片处理失败，请重试。', { cause: error })
  }
}

/**
 * 将 Canvas 图片源转换成识别请求使用的 JPEG。
 *
 * @param source Canvas 可绘制的图片、视频或位图源。
 * @param sourceWidth 原始图片宽度。
 * @param sourceHeight 原始图片高度。
 * @param profile 图片来源或识别用途。
 * @returns 不带 data URL 前缀的 base64 图片和实际输出尺寸。
 */
export async function prepareRecognitionImage(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  profile: RecognitionImageProfile,
): Promise<PreparedRecognitionImage> {
  let plan = getRecognitionImagePlan(sourceWidth, sourceHeight, profile)
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await renderRecognitionImage(source, plan, profile)
    } catch (error) {
      if (profile === 'barcode' || !(error instanceof RecognitionImageTooLargeError)) throw error
      if (attempt >= RECOGNITION_MAX_SIZE_RETRIES) throw error
      const nextPlan = resizePlan(plan, error.byteLength)
      if (!nextPlan) throw error
      plan = nextPlan
    }
  }
}

/** 读取相册文件并按照片或订单长截图规则转换成识别图片。 */
export async function prepareRecognitionPhoto(file: Blob): Promise<PreparedRecognitionImage> {
  const decoded = await decodeImage(file)
  try {
    return await prepareRecognitionImage(decoded.source, decoded.width, decoded.height, 'photo')
  } finally {
    decoded.close()
  }
}
