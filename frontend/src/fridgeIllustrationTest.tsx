import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { Layout } from './appTypes'
import { FridgeIllustrationPreview } from './fridgeIllustrationPreview'
import './fridgePreview.css'
import './fridgeIllustrationTest.css'

const slots = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index + 1}`, key: `${prefix}-${index + 1}` }))

function zone(key: string, label: string, temperatureMode: 'cold' | 'frozen', geometry: Layout['zones'][number]['geometry'], count: number, isDoor = false) {
  return { key, label, temperature_mode: temperatureMode, geometry, is_door: isDoor, slots: slots(key, count) }
}

function createTestLayout(templateKey: Layout['template_key']): Layout {
  const vertical = (y: number, height: number) => ({ x: 0, y, width: 100, height, layout_kind: 'vertical' as const })
  if (templateKey === 'side_by_side') {
    return {
      refrigerator_id: 'illustration-test', template_key: templateKey, revision: 1,
      zones: [
        zone('left-cabinet', '左柜体', 'cold', { x: 0, y: 0, width: 50, height: 100, layout_kind: 'vertical' }, 3),
        zone('right-cabinet', '右柜体', 'frozen', { x: 50, y: 0, width: 50, height: 100, layout_kind: 'vertical' }, 2),
        zone('left-door', '左门', 'cold', { x: 0, y: 0, width: 50, height: 100, layout_kind: 'vertical' }, 3, true),
        zone('door', '右门', 'cold', { x: 50, y: 0, width: 50, height: 100, layout_kind: 'vertical' }, 4, true),
      ],
    }
  }
  if (templateKey === 'french_door') {
    return {
      refrigerator_id: 'illustration-test', template_key: templateKey, revision: 1,
      zones: [
        zone('top', '上层冷藏', 'cold', vertical(0, 55), 3),
        zone('bottom', '下层冷冻', 'frozen', vertical(55, 45), 2),
        zone('door', '法式门', 'cold', vertical(0, 100), 6, true),
      ],
    }
  }
  if (templateKey === 'three_door' || templateKey === 'dual_middle') {
    return {
      refrigerator_id: 'illustration-test', template_key: templateKey, revision: 1,
      zones: [
        zone('top', '上层', 'cold', vertical(0, 38), 2),
        zone('middle', '中层', 'cold', { x: 0, y: 38, width: 100, height: 20, layout_kind: 'single_row' }, 2),
        zone('bottom', '下层', 'frozen', vertical(58, 42), 3),
        zone('door', '冰箱门', 'cold', vertical(0, 100), 5, true),
      ],
    }
  }
  if (templateKey === 'bottom_freezer_single') {
    return {
      refrigerator_id: 'illustration-test', template_key: templateKey, revision: 1,
      zones: [
        zone('refrigerator', '冷藏室', 'cold', vertical(0, 62), 4),
        zone('freezer', '冷冻室', 'frozen', vertical(62, 38), 2),
        zone('door', '冰箱门', 'cold', vertical(0, 100), 5, true),
      ],
    }
  }
  if (templateKey === 'mini') {
    return {
      refrigerator_id: 'illustration-test', template_key: templateKey, revision: 1,
      zones: [
        zone('freezer', '冷冻室', 'frozen', vertical(0, 50), 1),
        zone('refrigerator', '冷藏室', 'cold', vertical(50, 50), 2),
        zone('door_freezer', '冷冻门', 'frozen', vertical(0, 50), 1, true),
        zone('door', '冷藏门', 'cold', vertical(50, 50), 3, true),
      ],
    }
  }
  return {
    refrigerator_id: 'illustration-test', template_key: 'top_freezer_single', revision: 1,
    zones: [
      zone('freezer', '冷冻室', 'frozen', vertical(0, 35), 2),
      zone('refrigerator', '冷藏室', 'cold', vertical(35, 65), 4),
      zone('door_freezer', '冷冻门', 'frozen', vertical(0, 35), 1, true),
      zone('door', '冰箱门', 'cold', vertical(35, 65), 4, true),
    ],
  }
}

const supportedTemplates: Layout['template_key'][] = ['top_freezer_single', 'bottom_freezer_single', 'side_by_side', 'french_door', 'mini', 'three_door', 'dual_middle']
const requestedTemplate = new URLSearchParams(window.location.search).get('template') as Layout['template_key'] | null
const templateKey = requestedTemplate && supportedTemplates.includes(requestedTemplate) ? requestedTemplate : 'top_freezer_single'
const testLayout = createTestLayout(templateKey)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main className="fridge-illustration-test-page" aria-label="拟物冰箱视觉测试">
      <div className={`fridge-preview-frame fridge-preview-frame--home ${templateKey}`}>
        <FridgeIllustrationPreview layout={testLayout} variant="home" />
      </div>
    </main>
  </StrictMode>,
)
