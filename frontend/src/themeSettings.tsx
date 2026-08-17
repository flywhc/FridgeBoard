import { PageHeader, PageShell } from './sharedUi'
import { THEME_REGISTRY, type ThemeKey } from './theme'

function ThemeMiniPreview({ theme }: { theme: ThemeKey }) {
  return <div className="p7-theme-preview" data-theme-preview={theme} aria-hidden="true">
    <div className="p7-theme-fridge">
      <div className="p7-theme-cabinet"><i /><i /><i /><i /><i /></div>
      <span className="p7-theme-hinge" />
      <div className="p7-theme-door"><i /><i /><i /><i /></div>
    </div>
    <div className="p7-theme-food-icons"><i className="is-round" /><i className="is-oval" /><i className="is-leaf" /></div>
  </div>
}

export function ThemePreferencesPage({ theme, onBack, onOpenThemeSettings }: { theme: ThemeKey; onBack: () => void; onOpenThemeSettings: () => void }) {
  return <PageShell className="p7-shell p7-preferences-shell" header={<PageHeader title="应用偏好" onBack={onBack} />} bodyClassName="p7-scroll p7-settings p7-preferences">
    <p className="p7-preferences-intro">这些设置只保存在当前设备。</p>
    <section>
      <button type="button" className="p7-link-row" onClick={onOpenThemeSettings}>
        <span><b>主题</b><small>{THEME_REGISTRY[theme].label}</small></span>
        <b aria-hidden="true">›</b>
      </button>
    </section>
  </PageShell>
}

export function ThemeSettingsPage({ theme, onBack, onSelect }: { theme: ThemeKey; onBack: () => void; onSelect: (theme: ThemeKey) => void }) {
  return <PageShell className="p7-shell p7-theme-shell" header={<PageHeader title="主题设置" onBack={onBack} />} bodyClassName="p7-scroll p7-theme-settings">
    <p className="p7-theme-intro">选择后立即应用，只影响这台设备。</p>
    <div className="p7-theme-list" role="radiogroup" aria-label="应用主题">
      {(Object.keys(THEME_REGISTRY) as ThemeKey[]).map(themeKey => {
        const definition = THEME_REGISTRY[themeKey]
        const selected = themeKey === theme
        return <button key={themeKey} type="button" className={`p7-theme-option${selected ? ' is-selected' : ''}`} role="radio" aria-checked={selected} onClick={() => onSelect(themeKey)}>
          <ThemeMiniPreview theme={themeKey} />
          <span className="p7-theme-copy"><b>{definition.label}</b><small>{definition.description}</small></span>
          <span className="p7-theme-radio" aria-hidden="true" />
        </button>
      })}
    </div>
  </PageShell>
}
