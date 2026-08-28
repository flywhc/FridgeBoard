/** 库存识别流程的无状态展示组件。 */
import { useEffect, useRef } from 'react'
import type { Category, RecognitionOrderItem } from './appTypes'

/** 识别请求进行中时显示阶段状态和自动上滚的模型文字流。 */
export function RecognitionProgress({ message = '正在识别…', text = '', textLength = 0 }: { message?: string; text?: string; textLength?: number }) {
  const outputRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight })
  }, [text])
  return <div className="p6-recognition-progress" role="status" aria-live="polite">
    <strong>{message}</strong>
    <div className="p6-recognition-output" role="log" aria-label="大模型流式输出">
      <div ref={outputRef} className="p6-recognition-output-scroll">
        <span className="p6-recognition-output-text">{text || '等待模型输出…'}</span>
        {textLength > 0 && <small>已收到 {textLength} 字</small>}
      </div>
      <span className="p6-recognition-animation" aria-hidden="true"><i /><i /><i /></span>
    </div>
  </div>
}

/** 展示订单识别结果，未分类项目必须先手工选择小类。 */
export function OrderRecognitionList({ items, selection, categories, onToggle, onChooseCategory, locations = [], onChooseLocation }: {
  items: RecognitionOrderItem[]
  selection: Record<number, boolean>
  categories: Category[]
  onToggle: (index: number) => void
  onChooseCategory: (index: number) => void
  locations?: { id: string; label: string }[]
  onChooseLocation?: (index: number) => void
}) {
  const subcategories = categories.filter(category => category.parent_id)
  return <div className="p6-order-list">
    {items.map((item, index) => {
      const category = subcategories.find(candidate => candidate.id === item.subcategory_id)
      const selected = Boolean(category && selection[index])
      return <div className={`p6-order-item ${selected ? 'is-selected' : ''} ${category ? '' : 'is-unclassified'}`} key={`${item.item_name}-${index}`}>
        <input
          type="checkbox"
          disabled={!category}
          checked={selected}
          onChange={() => onToggle(index)}
          aria-label={category ? `选择${item.item_name}` : `${item.item_name}尚未分类`}
        />
        <div className="p6-order-main">
          <strong>{item.item_name}</strong>
          {item.specification && <small>{item.specification}</small>}
          {item.price != null && <small className="p6-order-price">实付 ¥{Number(item.price).toFixed(2)}</small>}
          <div className="p6-order-meta-row">
            <button
              type="button"
              className={`p6-order-category ${category ? '' : 'is-missing'}`}
              onClick={() => onChooseCategory(index)}
              aria-label={`为${item.item_name}${category ? '更改' : '选择'}分类`}
            >
              <span>{category ? `分类：${category.name}` : '选择分类（必填）'}</span><i aria-hidden="true">›</i>
            </button>
            {onChooseLocation && <button
              type="button"
              className="p6-order-location"
              onClick={() => onChooseLocation(index)}
              aria-label={`为${item.item_name}选择存放位置`}
            >
              <span>{locations.find(location => location.id === item.storage_slot_id)?.label ?? '选择位置'}</span><i aria-hidden="true">›</i>
            </button>}
          </div>
        </div>
        <b>×{item.quantity}</b>
      </div>
    })}
  </div>
}
