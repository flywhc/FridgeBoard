import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ICON_IMAGE_MAX_DIMENSION,
  ICON_IMAGE_MAX_PIXELS,
  prepareIconImage,
} from './iconImage'

afterEach(() => {
  vi.unstubAllGlobals()
})

function createCanvasMock(blobFactory: (type?: string) => Blob = type => new Blob(['png'], { type })) {
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      getImageData: (_x: number, _y: number, width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4), width, height,
      }),
      putImageData: vi.fn(),
    }),
    toBlob: (callback: BlobCallback, type?: string) => callback(blobFactory(type)),
  }
  return canvas
}

describe('自定义小类图标前端图片处理', () => {
  it('输出 PNG，最长边限制为 256px 并保持宽高比', async () => {
    const bitmap = { width: 1024, height: 512, close: vi.fn() }
    const canvas = createCanvasMock()
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
    vi.stubGlobal('document', { createElement: () => canvas })

    const prepared = await prepareIconImage(new File(['source'], 'photo.jpg', { type: 'image/jpeg' }))

    expect(prepared.file.type).toBe('image/png')
    expect(prepared.file.name).toBe('icon.png')
    expect(prepared.width).toBe(ICON_IMAGE_MAX_DIMENSION)
    expect(prepared.height).toBe(128)
    expect(prepared.backgroundRemoved).toBe(false)
    expect(bitmap.close).toHaveBeenCalledOnce()
  })

  it('小图不被放大，超出像素上限时在前端拒绝', async () => {
    const canvas = createCanvasMock()
    const smallBitmap = { width: 64, height: 32, close: vi.fn() }
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(smallBitmap))
    vi.stubGlobal('document', { createElement: () => canvas })
    await expect(prepareIconImage(new File(['source'], 'photo.jpg', { type: 'image/jpeg' }))).resolves.toMatchObject({ width: 64, height: 32 })

    const oversizedBitmap = { width: 4097, height: 4097, close: vi.fn() }
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(oversizedBitmap))
    await expect(prepareIconImage(new File(['source'], 'photo.jpg', { type: 'image/jpeg' }))).rejects.toThrow(`${ICON_IMAGE_MAX_PIXELS / 1_000_000}MP`)
    expect(oversizedBitmap.close).toHaveBeenCalledOnce()
  })

  it('转换结果超过 10MB 时拒绝上传', async () => {
    const bitmap = { width: 256, height: 256, close: vi.fn() }
    const canvas = createCanvasMock(() => new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: 'image/png' }))
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
    vi.stubGlobal('document', { createElement: () => canvas })

    await expect(prepareIconImage(new File(['source'], 'photo.jpg', { type: 'image/jpeg' }))).rejects.toThrow('超过 10MB')
    expect(bitmap.close).toHaveBeenCalledOnce()
  })

  it('识别到浅色背景时同时返回默认去背景文件和原图回退文件', async () => {
    const bitmap = { width: 5, height: 5, close: vi.fn() }
    const canvases = [createCanvasMock(), createCanvasMock()]
    const pixels = new Uint8ClampedArray(5 * 5 * 4)
    for (let index = 0; index < 25; index += 1) pixels.set([255, 255, 255, 255], index * 4)
    pixels.set([180, 30, 20, 255], 12 * 4)
    const analysisContext = canvases[0].getContext()
    analysisContext.getImageData = () => ({ data: pixels, width: 5, height: 5 })
    canvases[0].getContext = () => analysisContext
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
    vi.stubGlobal('document', { createElement: () => canvases.shift() })

    const prepared = await prepareIconImage(new File(['source'], 'photo.jpg', { type: 'image/jpeg' }))

    expect(prepared.backgroundRemoved).toBe(true)
    expect(prepared.file.name).toBe('icon.png')
    expect(prepared.originalFile?.name).toBe('icon-original.png')
  })
})
