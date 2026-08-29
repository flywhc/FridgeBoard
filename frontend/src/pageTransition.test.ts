import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PageShell, PageStack } from './sharedUi'
import { getFridgeSwipeTransitionClass, PAGE_TRANSITION_DURATION_MS, PAGE_TRANSITION_WATCHDOG_MS } from './pageTransition'

describe('手势过渡动画类名', () => {
  it('为左右横扫的退出和进入保持一致方向', () => {
    expect(getFridgeSwipeTransitionClass('next', 'exit')).toBe('p7-fridge-swipe-exit-next')
    expect(getFridgeSwipeTransitionClass('next', 'enter')).toBe('p7-fridge-swipe-enter-next')
    expect(getFridgeSwipeTransitionClass('previous', 'exit')).toBe('p7-fridge-swipe-exit-previous')
    expect(getFridgeSwipeTransitionClass('previous', 'enter')).toBe('p7-fridge-swipe-enter-previous')
  })

  it('返回时同时保留上层和下层页面并应用对应转场', () => {
    const markup = renderToStaticMarkup(createElement(PageStack, {
      pages: [
        { id: 1, element: createElement(PageShell, { header: createElement('header', null, '上级'), children: createElement('p', null, '上级内容') }) },
        { id: 2, element: createElement(PageShell, { header: createElement('header', null, '当前'), children: createElement('p', null, '当前内容') }) },
      ],
      transition: { type: 'pop', pageId: 2, incomingPageId: 1 },
    }))
    expect(markup).toContain('class="page-stack"')
    expect(markup).toContain('page-stack-layer is-underlay page-stack-enter-from-left')
    expect(markup).toContain('page-stack-layer is-active page-stack-exit-to-right')
    expect(markup).toContain('page-stack-layer is-underlay page-stack-enter-from-left" inert=""')
    expect(markup).not.toMatch(/<div class="page-stack-layer[^>]*aria-hidden=/)
    expect(markup).toContain('上级内容')
    expect(markup).toContain('当前内容')
  })

  it('嵌套编辑页返回时可以保持下层抽屉静止', () => {
    const markup = renderToStaticMarkup(createElement(PageStack, {
      pages: [
        { id: 1, element: createElement('div', null, '选择分类抽屉') },
        { id: 2, element: createElement('div', null, '编辑小类') },
      ],
      transition: { type: 'pop', pageId: 2, incomingPageId: 1, incomingAnimation: 'none' },
    }))
    expect(markup).toContain('page-stack-layer is-underlay"')
    expect(markup).toContain('page-stack-layer is-active page-stack-exit-to-right')
    expect(markup).not.toContain('page-stack-layer is-underlay page-stack-enter-from-left')
  })

  it('正向进入新页面时明确从右侧向左侧进入', () => {
    const markup = renderToStaticMarkup(createElement(PageStack, {
      pages: [
        { id: 1, element: createElement('div', null, '选择分类抽屉') },
        { id: 2, element: createElement('div', null, '新建小类') },
      ],
      transition: { type: 'push', pageId: 2, incomingPageId: 2, incomingAnimation: 'from-right' },
    }))
    expect(markup).toContain('page-stack-layer is-active page-stack-enter-from-right')
    expect(markup).toContain('page-stack-layer is-active page-stack-enter-from-right" inert=""')
    expect(markup).not.toContain('page-stack-enter-from-left')
  })

  it('页面栈等待真实动画结束，故障兜底不得抢先终止正常动画', () => {
    expect(PAGE_TRANSITION_WATCHDOG_MS).toBeGreaterThan(PAGE_TRANSITION_DURATION_MS)
  })
})
