import { React } from '../ui/react/runtime';
import { settingsText, type SettingsMessage } from './settings-i18n';
import type { AppearanceColor, AppearancePageCommand, AppearancePageModel } from './settings-appearance-model';

const COLORS: readonly [AppearanceColor, SettingsMessage][] = [
  ['black', 'Black'], ['red', 'Red'], ['green', 'Green'], ['yellow', 'Yellow'],
  ['blue', 'Blue'], ['magenta', 'Magenta'], ['cyan', 'Cyan'], ['white', 'White'],
];
const HEX = /^#[0-9a-fA-F]{6}$/;

export function AppearancePage({ model, dispatch }: { model: AppearancePageModel; dispatch: (command: AppearancePageCommand) => void }) {
  const t = (message: SettingsMessage) => settingsText(model.language, message);
  const zh = model.language === 'zh-CN';
  const editor = model.editor;
  return <div className="neo-settings-appearance">
    {model.view === 'library' ? <>
      <h2>{t('Appearance')}</h2>
      <section className="appearance-controls">
        <div><span>{t('Marker width (px)')} </span>{[1, 2, 3, 4].map((width) =>
          <button type="button" key={width} aria-pressed={model.markerWidth === width} onClick={() => dispatch({ type: 'marker-width', value: width })}>{width}px</button>)}</div>
        <div><span>{t('Status style')} </span>{(['neutral', 'tinted'] as const).map((style) =>
          <button type="button" key={style} aria-pressed={model.statusStyle === style} onClick={() => dispatch({ type: 'status-style', value: style })}>{t(style === 'neutral' ? 'Neutral' : 'Tinted')}</button>)}</div>
      </section>
      <h3>{t('Themes')}</h3>
      <div className="appearance-grid">
        {model.themes.map((theme) => <div key={theme.id} className="appearance-card" data-theme-id={theme.id} aria-current={theme.selected ? 'true' : undefined} onClick={(event) => { if (!(event.target as Element).closest('button')) dispatch({ type: 'select', id: theme.id }); }}>
          <button type="button" className="appearance-choice" aria-label={zh ? `选择 ${theme.name}` : `Select ${theme.name}`} onClick={() => dispatch({ type: 'select', id: theme.id })}>{theme.name}</button>
          <div className="appearance-note">{theme.flavor}{theme.selected ? ` · ${t('Active')}` : ''}</div>
          <div className="appearance-swatches">{COLORS.map(([key, label]) => <span key={key} aria-label={`${t(label)} ${theme.palette[key]}`} style={{ background: theme.palette[key] }} />)}</div>
          <div className="appearance-actions">
            {theme.custom && <button type="button" onClick={() => dispatch({ type: 'edit', id: theme.id })}>{t('Edit')}</button>}
            <button type="button" onClick={() => dispatch({ type: 'copy', id: theme.id })}>{zh ? '复制' : 'Copy'}</button>
            {theme.custom && <button type="button" onClick={() => dispatch({ type: 'delete', id: theme.id })}>{t(model.confirmedDelete === theme.id ? 'Confirm delete' : 'Delete')}</button>}
          </div>
        </div>)}
        <button type="button" className="appearance-add" onClick={() => dispatch({ type: 'create' })}>{t('+ Custom')}</button>
      </div>
    </> : editor && <>
      <div className="appearance-toolbar">
        <button type="button" onClick={() => dispatch({ type: 'back' })}>{t('Back to themes')}</button>
        {editor.isNew && <button type="button" disabled={!editor.canAdd} onClick={() => dispatch({ type: 'add' })}>{t('Add')}</button>}
        <button type="button" onClick={() => dispatch({ type: 'reset' })}>{zh ? '重置调色板' : 'Reset palettes'}</button>
      </div>
      <h2>{t('Appearance')}</h2><h3>{t('Custom theme')}</h3>
      <label className="appearance-name">{t('Theme name')}
        <input type="text" maxLength={100} value={editor.name} aria-label={t('Theme name')} aria-invalid={!editor.nameValid} onChange={(event) => dispatch({ type: 'name', value: event.currentTarget.value })} />
      </label>
      <div className="appearance-modes">{(['light', 'dark'] as const).map((mode) =>
        <button type="button" key={mode} aria-pressed={editor.mode === mode} onClick={() => dispatch({ type: 'mode', value: mode })}>{t(mode === 'light' ? 'Light' : 'Dark')}</button>)}</div>
      <div className="appearance-fields">{COLORS.map(([key, label]) => {
        const value = editor.hex[editor.mode][key];
        return <div className="appearance-row" key={key}>
          <span>{t(label)}</span>
          <input type="color" aria-label={zh ? `${t(label)} 颜色选择器` : `${label} color picker`} value={editor.colors[key]} onChange={(event) => dispatch({ type: 'picker', key, value: event.currentTarget.value })} />
          <input type="text" aria-label={zh ? `${t(label)} 十六进制` : `${label} hex`} aria-invalid={!HEX.test(value)} value={value} onChange={(event) => dispatch({ type: 'hex', key, value: event.currentTarget.value })} />
          {!HEX.test(value) && <span className="appearance-error">{t('Use #RRGGBB')}</span>}
        </div>;
      })}</div>
      <div className="appearance-preview" aria-label={t('Theme preview')} style={{ background: editor.preview.background, color: editor.preview.foreground, borderColor: editor.preview.border }}>
        {t(editor.mode === 'light' ? 'Light' : 'Dark')} {zh ? '调色板' : 'palette'} · {t('Selection')} = {t('Yellow')} {editor.colors.yellow} · {t('Visual')} = {t('Green')} {editor.colors.green}
        <div className="appearance-samples">{(['selection', 'visual'] as const).map((kind) => {
          const colors = editor.preview[kind];
          return <span key={kind} style={{ background: colors.background, color: colors.foreground, borderColor: colors.border, borderLeft: `${editor.preview.markerWidth}px solid ${editor.colors[kind === 'selection' ? 'yellow' : 'green']}` }}>{zh ? kind === 'selection' ? '选区' : '可视' : kind === 'selection' ? 'SEL' : 'VISUAL'}</span>;
        })}</div>
      </div>
    </>}
    <p role="status">{model.status}</p>
  </div>;
}

export const APPEARANCE_REACT_CSS = `
.neo-settings-appearance { display:block; overflow:auto; padding:16px 20px; color:var(--zotero-neo-text); }
.neo-settings-appearance h2 { margin:0 0 .55em; font-size:1.55em; }
.neo-settings-appearance h3 { margin:0 0 .6em; font-size:1.2em; }
.neo-settings-appearance button, .neo-settings-appearance input { font:inherit; color:var(--zotero-neo-text); }
.neo-settings-appearance button { background:var(--zotero-neo-elevated); border:1px solid var(--zotero-neo-border); border-radius:4px; padding:.35em .65em; cursor:pointer; }
.neo-settings-appearance button[aria-pressed="true"] { background:var(--zotero-neo-selected); color:var(--zotero-neo-selected-text); border-color:var(--zotero-neo-accent); }
.neo-settings-appearance button:disabled { opacity:.5; cursor:default; }
.neo-settings-appearance button:focus-visible, .neo-settings-appearance input:focus-visible { outline:2px solid var(--zotero-neo-focus-ring); outline-offset:1px; }
.neo-settings-appearance .appearance-controls { display:flex; flex-wrap:wrap; gap:18px; align-items:center; margin:0 0 18px; }
.neo-settings-appearance .appearance-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr)); gap:12px; }
.neo-settings-appearance .appearance-card { padding:12px; border:2px solid var(--zotero-neo-border); border-radius:7px; background:var(--zotero-neo-elevated); }
.neo-settings-appearance .appearance-card[aria-current="true"] { border-color:var(--zotero-neo-accent); background:var(--zotero-neo-selected); }
.neo-settings-appearance .appearance-choice { width:100%; text-align:left; font-weight:600; font-size:1.15em; border:0; background:transparent; }
.neo-settings-appearance .appearance-note { font-size:.95em; color:var(--zotero-neo-muted); }
.neo-settings-appearance .appearance-swatches { display:grid; grid-template-columns:repeat(8,minmax(0,1fr)); gap:3px; margin:10px 0; }
.neo-settings-appearance .appearance-swatches span { height:24px; border:1px solid var(--zotero-neo-border); border-radius:3px; }
.neo-settings-appearance .appearance-actions, .neo-settings-appearance .appearance-toolbar, .neo-settings-appearance .appearance-samples { display:flex; gap:6px; }
.neo-settings-appearance .appearance-add { min-height:5.5em; font-size:1.15em; text-align:left; }
.neo-settings-appearance .appearance-toolbar { margin-bottom:12px; }
.neo-settings-appearance .appearance-name { display:grid; gap:4px; margin-bottom:14px; max-width:360px; }
.neo-settings-appearance input[type="text"] { padding:.4em; background:var(--zotero-neo-input); border:1px solid var(--zotero-neo-border); }
.neo-settings-appearance .appearance-modes { margin-bottom:14px; }
.neo-settings-appearance .appearance-fields { display:grid; gap:5px; max-width:560px; }
.neo-settings-appearance .appearance-row { display:flex; align-items:center; gap:12px; min-height:35px; }
.neo-settings-appearance .appearance-row > span:first-child { width:90px; }
.neo-settings-appearance .appearance-row input[type="text"] { width:7em; }
.neo-settings-appearance .appearance-error { color:var(--zotero-neo-error); }
.neo-settings-appearance .appearance-preview { padding:10px; margin:16px 0; border:1px solid; border-radius:5px; }
.neo-settings-appearance .appearance-samples { margin-top:8px; }
.neo-settings-appearance .appearance-samples span { padding:4px 8px; border:1px solid; border-radius:3px; }
`;
