import { describe, expect, it } from 'vitest'
import { removeLightBackground } from './iconBackgroundRemoval'

function image(width: number, height: number, pixel: (x: number, y: number) => [number, number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data.set(pixel(x, y), (y * width + x) * 4)
    }
  }
  return { width, height, data }
}

function pixelAt(data: Uint8ClampedArray, width: number, x: number, y: number) {
  return Array.from(data.slice((y * width + x) * 4, (y * width + x) * 4 + 4))
}

describe('本地图标浅色背景移除', () => {
  it('移除边界连通的纯白背景并保留主体', () => {
    const source = image(9, 9, (x, y) => x >= 3 && x <= 5 && y >= 3 && y <= 5
      ? [180, 30, 20, 255]
      : [255, 255, 255, 255])

    const result = removeLightBackground(source)

    expect(result.backgroundRemoved).toBe(true)
    expect(pixelAt(result.data, 9, 0, 0)[3]).toBe(0)
    expect(pixelAt(result.data, 9, 4, 4)).toEqual([180, 30, 20, 255])
  })

  it('容忍从四边向中心变深的奶白背景', () => {
    const source = image(15, 15, (x, y) => {
      if (x >= 6 && x <= 8 && y >= 6 && y <= 8) return [45, 120, 70, 255]
      const edgeDistance = Math.min(x, y, 14 - x, 14 - y)
      const shade = 250 - Math.min(edgeDistance, 5) * 4
      return [shade, shade - 3, shade - 12, 255]
    })

    const result = removeLightBackground(source)

    expect(result.backgroundRemoved).toBe(true)
    expect(pixelAt(result.data, 15, 5, 5)[3]).toBe(0)
    expect(pixelAt(result.data, 15, 7, 7)[3]).toBe(255)
  })

  it('不删除被深色轮廓包围的白色主体区域', () => {
    const source = image(11, 11, (x, y) => {
      if (x >= 3 && x <= 7 && y >= 3 && y <= 7) {
        const outline = x === 3 || x === 7 || y === 3 || y === 7
        return outline ? [30, 30, 30, 255] : [252, 252, 248, 255]
      }
      return [255, 253, 245, 255]
    })

    const result = removeLightBackground(source)

    expect(pixelAt(result.data, 11, 5, 5)[3]).toBe(255)
  })

  it('不删除与背景存在浅色边缘但没有深色轮廓的主体', () => {
    const source = image(15, 15, (x, y) => {
      const distance = Math.hypot(x - 7, y - 7)
      if (distance <= 1) return [230, 120, 30, 255]
      if (distance <= 4) return [240, 240, 235, 255]
      return [255, 255, 250, 255]
    })

    const result = removeLightBackground(source)

    expect(pixelAt(result.data, 15, 0, 0)[3]).toBe(0)
    expect(pixelAt(result.data, 15, 7, 4)[3]).toBe(255)
    expect(pixelAt(result.data, 15, 7, 7)[3]).toBe(255)
  })

  it('把与背景相连的浅灰阴影保留为半透明像素', () => {
    const source = image(13, 13, (x, y) => {
      if (x >= 4 && x <= 7 && y >= 4 && y <= 7) return [170, 50, 30, 255]
      if (x >= 4 && x <= 9 && y >= 8 && y <= 9) return [218, 216, 210, 255]
      return [250, 248, 240, 255]
    })

    const result = removeLightBackground(source)
    const shadowAlpha = pixelAt(result.data, 13, 8, 8)[3]

    expect(shadowAlpha).toBeGreaterThan(0)
    expect(shadowAlpha).toBeLessThan(255)
  })

  it('已有透明边界时保留原始 RGBA 数据', () => {
    const source = image(9, 9, (x, y) => x === 0 || y === 0 || x === 8 || y === 8
      ? [20, 30, 40, 0]
      : [245, 245, 245, 128])

    const result = removeLightBackground(source)

    expect(result.backgroundRemoved).toBe(false)
    expect(result.data).toEqual(source.data)
  })

  it('边界没有占主导的浅色背景时不修改图片', () => {
    const source = image(8, 8, (x, y) => [x * 30, y * 30, (x + y) * 14, 255])

    const result = removeLightBackground(source)

    expect(result.backgroundRemoved).toBe(false)
    expect(result.data).toEqual(source.data)
  })
})
