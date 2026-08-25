import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { OptionPickerField } from './sharedUi'

describe('应用内选项选择器', () => {
  it('显示当前选项并使用按钮触发选择，不渲染原生 select', () => {
    const markup = renderToStaticMarkup(createElement(OptionPickerField, {
      label: '星期',
      value: '2',
      options: ['周一', '周二', '周三'].map((label, index) => ({ value: String(index), label })),
      onChange: () => undefined,
    }))

    expect(markup).toContain('class="p9-option-picker-input"')
    expect(markup).toContain('>周三</span>')
    expect(markup).toContain('aria-haspopup="dialog"')
    expect(markup).not.toContain('<select')
    expect(markup).not.toContain('large-fridge')
  })
})
