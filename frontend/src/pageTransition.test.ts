import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PageShell } from './sharedUi'
import { consumePageEnterTransition, getFridgeSwipeTransitionClass, getPageEnterClass, requestPageEnterTransition } from './pageTransition'

describe('手势过渡动画类名', () => {
  it('为左右横扫的退出和进入保持一致方向', () => {
    expect(getFridgeSwipeTransitionClass('next', 'exit')).toBe('p7-fridge-swipe-exit-next')
    expect(getFridgeSwipeTransitionClass('next', 'enter')).toBe('p7-fridge-swipe-enter-next')
    expect(getFridgeSwipeTransitionClass('previous', 'exit')).toBe('p7-fridge-swipe-exit-previous')
    expect(getFridgeSwipeTransitionClass('previous', 'enter')).toBe('p7-fridge-swipe-enter-previous')
  })

  it('二级页返回后上级页从左侧进入', () => {
    expect(getPageEnterClass('back')).toBe('page-enter-from-left')
    expect(getPageEnterClass(null)).toBe('')
  })

  it('页面壳只消费一次返回入场标记', () => {
    requestPageEnterTransition('back')
    const markup = renderToStaticMarkup(createElement(PageShell, { header: createElement('header', null, '上级'), children: createElement('p', null, '内容') }))
    expect(markup).toContain('class="mobile-page page-enter-from-left"')
    expect(consumePageEnterTransition()).toBeNull()
  })
})
