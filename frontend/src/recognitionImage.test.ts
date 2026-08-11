import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getRecognitionImagePlan,
  getRecognitionJpegQualities,
  prepareRecognitionImage,
  RECOGNITION_CAMERA_MAX_DIMENSION,
  RECOGNITION_FALLBACK_JPEG_QUALITY,
  RECOGNITION_PRIMARY_JPEG_QUALITY,
} from './recognitionImage'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('P6 识别图片处理规划', () => {
  it('订单长截图保持原始宽高，避免把纵向文字压缩得过小', () => {
    expect(getRecognitionImagePlan(1220, 5418, 'photo')).toEqual({
      width: 1220,
      height: 5418,
      longScreenshot: true,
    })
  })

  it('极端长截图先限制高度和总像素，避免创建失控的移动端画布', () => {
    const plan = getRecognitionImagePlan(1220, 20000, 'photo')
    expect(plan.height).toBeLessThanOrEqual(8192)
    expect(plan.width * plan.height).toBeLessThanOrEqual(12_000_000)
    expect(plan.longScreenshot).toBe(true)
  })

  it('普通照片限制最大边且不放大小图片', () => {
    expect(getRecognitionImagePlan(4032, 3024, 'camera')).toEqual({
      width: RECOGNITION_CAMERA_MAX_DIMENSION,
      height: 1440,
      longScreenshot: false,
    })
    expect(getRecognitionImagePlan(800, 1200, 'photo')).toEqual({
      width: 800,
      height: 1200,
      longScreenshot: false,
    })
  })

  it('扫码保留原始尺寸，避免改变本地条码识别输入', () => {
    expect(getRecognitionImagePlan(4032, 3024, 'barcode')).toEqual({
      width: 4032,
      height: 3024,
      longScreenshot: false,
    })
    expect(getRecognitionJpegQualities('barcode')).toEqual([0.82])
  })

  it('普通识别先用 0.75，超过目标大小再降到 0.70', () => {
    expect(getRecognitionJpegQualities('camera')).toEqual([
      RECOGNITION_PRIMARY_JPEG_QUALITY,
      RECOGNITION_FALLBACK_JPEG_QUALITY,
    ])
    expect(getRecognitionJpegQualities('photo')).toEqual([
      RECOGNITION_PRIMARY_JPEG_QUALITY,
      RECOGNITION_FALLBACK_JPEG_QUALITY,
    ])
  })

  it('首档 JPEG 超过 512 KB 时才使用降档质量', async () => {
    const qualities: number[] = []
    const canvas = {
      getContext: () => ({ drawImage: () => undefined }),
      toBlob: (callback: BlobCallback, _type?: string, quality?: number) => {
        qualities.push(quality ?? 0)
        callback(new Blob([new Uint8Array(quality === 0.75 ? 600 * 1024 : 400 * 1024)], { type: 'image/jpeg' }))
      },
    }
    vi.stubGlobal('document', { createElement: () => canvas })
    vi.stubGlobal('FileReader', class {
      result = 'data:image/jpeg;base64,compressed'
      onload: (() => void) | null = null
      onerror: (() => void) | null = null

      readAsDataURL() {
        this.onload?.()
      }
    })

    const prepared = await prepareRecognitionImage({} as CanvasImageSource, 1220, 5418, 'photo')

    expect(qualities).toEqual([0.75, 0.70])
    expect(prepared.byteLength).toBe(400 * 1024)
    expect(prepared.width).toBe(1220)
    expect(prepared.height).toBe(5418)
  })

  it('两档质量都超出预算时继续缩小，直到满足预算或抛出可操作错误', async () => {
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => undefined }),
      toBlob: (callback: BlobCallback) => {
        const byteLength = canvas.width > 900 ? 600 * 1024 : 400 * 1024
        callback(new Blob([new Uint8Array(byteLength)], { type: 'image/jpeg' }))
      },
    }
    vi.stubGlobal('document', { createElement: () => canvas })
    vi.stubGlobal('FileReader', class {
      result = 'data:image/jpeg;base64,compressed'
      onload: (() => void) | null = null
      onerror: (() => void) | null = null

      readAsDataURL() {
        this.onload?.()
      }
    })

    const prepared = await prepareRecognitionImage({} as CanvasImageSource, 1220, 5418, 'photo')

    expect(prepared.byteLength).toBe(400 * 1024)
    expect(prepared.width).toBeLessThanOrEqual(900)
  })
})
