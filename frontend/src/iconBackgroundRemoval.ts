/** 本地图标的浅色边界背景识别与软透明蒙版。 */

export type PixelImage = {
  width: number
  height: number
  data: Uint8ClampedArray
}

export type BackgroundRemovalResult = {
  data: Uint8ClampedArray
  backgroundRemoved: boolean
}

type Rgb = [number, number, number]

const TRANSPARENT_BORDER_RATIO = 0.12
const LIGHT_BORDER_RATIO = 0.65
const MAX_BORDER_CHROMA = 55
const MAX_CONNECTED_CHROMA = 90
const MIN_BORDER_CHANNEL = 180
const MIN_CONNECTED_CHANNEL = 145
const MAX_BACKGROUND_GRADIENT_DISTANCE = 16

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

function percentile(values: number[], position: number): number {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * position))] ?? 0
}

function distance(left: Rgb, right: Rgb): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2])
}

function chroma(color: Rgb): number {
  return Math.max(...color) - Math.min(...color)
}

function smoothstep(lower: number, upper: number, value: number): number {
  const normalized = Math.max(0, Math.min(1, (value - lower) / (upper - lower)))
  return normalized * normalized * (3 - 2 * normalized)
}

function borderPixelIndexes(width: number, height: number): number[] {
  const indexes: number[] = []
  for (let x = 0; x < width; x += 1) {
    indexes.push(x, (height - 1) * width + x)
  }
  for (let y = 1; y < height - 1; y += 1) {
    indexes.push(y * width, y * width + width - 1)
  }
  return indexes
}

function readRgb(data: Uint8ClampedArray, pixelIndex: number): Rgb {
  const offset = pixelIndex * 4
  return [data[offset], data[offset + 1], data[offset + 2]]
}

function estimateBackground(source: PixelImage, borderIndexes: number[]): { color: Rgb; hardDistance: number; softDistance: number } | null {
  const transparentCount = borderIndexes.filter(index => source.data[index * 4 + 3] < 32).length
  if (transparentCount / borderIndexes.length >= TRANSPARENT_BORDER_RATIO) return null

  const lightColors = borderIndexes
    .filter(index => source.data[index * 4 + 3] >= 224)
    .map(index => readRgb(source.data, index))
    .filter(color => Math.min(...color) >= MIN_BORDER_CHANNEL && chroma(color) <= MAX_BORDER_CHROMA)
  if (lightColors.length / borderIndexes.length < LIGHT_BORDER_RATIO) return null

  const color: Rgb = [
    median(lightColors.map(value => value[0])),
    median(lightColors.map(value => value[1])),
    median(lightColors.map(value => value[2])),
  ]
  if (Math.min(...color) < 190 || chroma(color) > MAX_BORDER_CHROMA) return null

  const borderSpread = percentile(lightColors.map(value => distance(value, color)), 0.95)
  const hardDistance = Math.max(40, Math.min(58, borderSpread + 28))
  return { color, hardDistance, softDistance: Math.min(105, hardDistance + 55) }
}

function canJoinBackground(color: Rgb, background: Rgb, softDistance: number): boolean {
  return Math.min(...color) >= MIN_CONNECTED_CHANNEL
    && chroma(color) <= MAX_CONNECTED_CHROMA
    && distance(color, background) <= softDistance
}

function unmatteChannel(channel: number, background: number, foregroundAlpha: number): number {
  if (foregroundAlpha <= 0.02) return 0
  return Math.max(0, Math.min(255, Math.round((channel - background * (1 - foregroundAlpha)) / foregroundAlpha)))
}

/**
 * 移除与画布边界连通的浅色背景，并将浅灰阴影保留为半透明像素。
 *
 * 透明边界或背景置信度不足时返回像素副本，避免破坏已有透明图和复杂照片。
 */
export function removeLightBackground(source: PixelImage): BackgroundRemovalResult {
  const output = new Uint8ClampedArray(source.data)
  if (source.width < 2 || source.height < 2 || source.data.length !== source.width * source.height * 4) {
    return { data: output, backgroundRemoved: false }
  }

  const borderIndexes = borderPixelIndexes(source.width, source.height)
  const estimate = estimateBackground(source, borderIndexes)
  if (!estimate) return { data: output, backgroundRemoved: false }

  const backgroundMask = new Uint8Array(source.width * source.height)
  const backgroundQueue: number[] = []
  for (const pixelIndex of borderIndexes) {
    const color = readRgb(source.data, pixelIndex)
    if (!backgroundMask[pixelIndex] && canJoinBackground(color, estimate.color, estimate.softDistance)) {
      backgroundMask[pixelIndex] = 1
      backgroundQueue.push(pixelIndex)
    }
  }

  for (let cursor = 0; cursor < backgroundQueue.length; cursor += 1) {
    const pixelIndex = backgroundQueue[cursor]
    const x = pixelIndex % source.width
    const y = Math.floor(pixelIndex / source.width)
    const currentColor = readRgb(source.data, pixelIndex)
    for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
      for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
        if (xOffset === 0 && yOffset === 0) continue
        const nextX = x + xOffset
        const nextY = y + yOffset
        if (nextX < 0 || nextX >= source.width || nextY < 0 || nextY >= source.height) continue
        const nextIndex = nextY * source.width + nextX
        if (backgroundMask[nextIndex]) continue
        const nextColor = readRgb(source.data, nextIndex)
        if (!canJoinBackground(nextColor, estimate.color, estimate.softDistance)) continue
        if (distance(currentColor, nextColor) > MAX_BACKGROUND_GRADIENT_DISTANCE) continue
        backgroundMask[nextIndex] = 1
        backgroundQueue.push(nextIndex)
      }
    }
  }

  const shadowMask = new Uint8Array(source.width * source.height)
  const shadowQueue: number[] = []
  const enqueueShadow = (pixelIndex: number) => {
    if (backgroundMask[pixelIndex] || shadowMask[pixelIndex]) return
    const color = readRgb(source.data, pixelIndex)
    const colorDistance = distance(color, estimate.color)
    if (!canJoinBackground(color, estimate.color, estimate.softDistance)) return
    if (colorDistance <= estimate.hardDistance) return
    shadowMask[pixelIndex] = 1
    shadowQueue.push(pixelIndex)
  }
  for (const pixelIndex of backgroundQueue) {
    const x = pixelIndex % source.width
    const y = Math.floor(pixelIndex / source.width)
    for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
      for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
        const nextX = x + xOffset
        const nextY = y + yOffset
        if (nextX < 0 || nextX >= source.width || nextY < 0 || nextY >= source.height) continue
        enqueueShadow(nextY * source.width + nextX)
      }
    }
  }
  for (let cursor = 0; cursor < shadowQueue.length; cursor += 1) {
    const pixelIndex = shadowQueue[cursor]
    const x = pixelIndex % source.width
    const y = Math.floor(pixelIndex / source.width)
    for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
      for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
        const nextX = x + xOffset
        const nextY = y + yOffset
        if (nextX < 0 || nextX >= source.width || nextY < 0 || nextY >= source.height) continue
        enqueueShadow(nextY * source.width + nextX)
      }
    }
  }

  let changedPixels = 0
  const applyAlpha = (pixelIndex: number, foregroundAlpha: number) => {
    const offset = pixelIndex * 4
    const color = readRgb(source.data, pixelIndex)
    const originalAlpha = source.data[offset + 3]
    const nextAlpha = Math.round(originalAlpha * foregroundAlpha)
    if (nextAlpha !== originalAlpha) changedPixels += 1
    output[offset] = unmatteChannel(color[0], estimate.color[0], foregroundAlpha)
    output[offset + 1] = unmatteChannel(color[1], estimate.color[1], foregroundAlpha)
    output[offset + 2] = unmatteChannel(color[2], estimate.color[2], foregroundAlpha)
    output[offset + 3] = nextAlpha
  }
  for (const pixelIndex of backgroundQueue) applyAlpha(pixelIndex, 0)
  for (const pixelIndex of shadowQueue) {
    const colorDistance = distance(readRgb(source.data, pixelIndex), estimate.color)
    applyAlpha(pixelIndex, smoothstep(estimate.hardDistance, estimate.softDistance, colorDistance))
  }

  return { data: output, backgroundRemoved: changedPixels > 0 }
}
