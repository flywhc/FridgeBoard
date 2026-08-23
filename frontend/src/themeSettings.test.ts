import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ThemePreferencesPage, ThemeSettingsPage } from './themeSettings'

describe('主题设置页面', () => {
  it('应用偏好显示当前主题并进入主题设置', () => {
    const markup = renderToStaticMarkup(createElement(ThemePreferencesPage, { theme: 'cartoon', onBack: () => undefined, onOpenThemeSettings: () => undefined, onNotificationSettings: () => undefined }))
    expect(markup).toContain('应用偏好')
    expect(markup).toContain('<b>主题</b><small>卡通</small>')
    expect(markup).toContain('<b>通知与权限</b><small>本机提醒时间和系统通知权限</small>')
    expect(markup).not.toContain('这些设置只保存在当前设备。')
  })

  it('将水墨主题显示为水墨', () => {
    const preferencesMarkup = renderToStaticMarkup(createElement(ThemePreferencesPage, { theme: 'ink', onBack: () => undefined, onOpenThemeSettings: () => undefined, onNotificationSettings: () => undefined }))
    const settingsMarkup = renderToStaticMarkup(createElement(ThemeSettingsPage, { theme: 'ink', onBack: () => undefined, onSelect: () => undefined }))
    expect(preferencesMarkup).toContain('<b>主题</b><small>水墨</small>')
    expect(settingsMarkup).toContain('<b>水墨</b><small>黑白高对比，清晰克制</small>')
    expect(settingsMarkup).not.toContain('水墨屏')
  })

  it('显示三个单选主题并标记当前选项', () => {
    const markup = renderToStaticMarkup(createElement(ThemeSettingsPage, { theme: 'skeuomorphic', onBack: () => undefined, onSelect: () => undefined }))
    expect(markup).toContain('主题设置')
    expect(markup).not.toContain('选择后立即应用，只影响这台设备。')
    expect(markup).toContain('role="radiogroup"')
    expect(markup.match(/role="radio"/g)).toHaveLength(3)
    expect(markup).toContain('aria-checked="true"')
    expect(markup).toContain('真实材质，暖色立体层次')
  })

  it('将拟物主题显示在列表第一项', () => {
    const markup = renderToStaticMarkup(createElement(ThemeSettingsPage, { theme: 'skeuomorphic', onBack: () => undefined, onSelect: () => undefined }))
    expect(markup.indexOf('<b>拟物</b>')).toBeLessThan(markup.indexOf('<b>水墨</b>'))
    expect(markup.indexOf('<b>拟物</b>')).toBeLessThan(markup.indexOf('<b>卡通</b>'))
  })
})
