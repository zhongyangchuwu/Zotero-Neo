import { React } from '../runtime';
import { createReactView } from '../view';
import type { ReactView } from '../types';
import { THEME_VARS } from '../../theme';
import type {
  ExtensionsReactCommand,
  ExtensionsReactModel,
} from '../../../modules/extensions/react-model';

export const EXTENSIONS_REACT_CSS = `
.neo-extensions-panel{width:min(960px,calc(100vw - 80px));height:min(640px,calc(100vh - 80px));min-width:620px;min-height:420px;display:flex;flex-direction:column;overflow:hidden;background:${THEME_VARS.surface};border:1px solid ${THEME_VARS.border};border-radius:8px;box-shadow:0 24px 70px ${THEME_VARS.shadow}}
.neo-extensions-header{display:flex;align-items:center;gap:14px;padding:12px 14px;background:${THEME_VARS.elevated};border-bottom:1px solid ${THEME_VARS.border}}
.neo-extensions-header strong{font-size:14px;white-space:nowrap}.neo-extensions-count{color:${THEME_VARS.muted};white-space:nowrap}
.neo-extensions-input{flex:1;min-width:140px;padding:6px 9px;color:${THEME_VARS.text};background:${THEME_VARS.input};border:1px solid ${THEME_VARS.border};border-radius:5px;outline:none;font:inherit}
.neo-extensions-input::placeholder{color:${THEME_VARS.muted} !important;opacity:1}
.neo-extensions-content{display:grid;grid-template-columns:minmax(260px,42%) minmax(320px,58%);flex:1;min-height:0}
.neo-extensions-list{overflow:auto;min-height:0;padding:7px 0;border-right:1px solid ${THEME_VARS.border};outline:none}
.neo-extensions-details{overflow:auto;min-height:0;padding:20px 22px;background:${THEME_VARS.elevated};white-space:pre-wrap;outline:none}
.neo-extensions-row{display:flex;align-items:center;gap:10px;padding:7px 12px;cursor:pointer;border-left:3px solid transparent}.neo-extensions-row.selected{color:${THEME_VARS.selectedText};background:${THEME_VARS.selected};border-left-color:${THEME_VARS.accent}}
.neo-extensions-footer{padding:7px 12px;color:${THEME_VARS.muted};border-top:1px solid ${THEME_VARS.border};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.neo-extensions-links{margin-top:18px;display:flex;flex-wrap:wrap;gap:8px 14px;color:${THEME_VARS.muted}}.neo-extensions-links button{padding:0;border:0;background:none;color:${THEME_VARS.accent};font:inherit;text-decoration:underline;cursor:pointer}
`;

function ExtensionsView({
  model,
  dispatch,
}: {
  model: ExtensionsReactModel;
  dispatch: (command: ExtensionsReactCommand) => void;
}) {
  const plugin = model.plugins[model.selected];
  const links = plugin
    ? [
        { label: 'Homepage', url: plugin.homepageURL, kind: 'homepage' as const },
        {
          label: 'Repository',
          url: plugin.repositoryURL === plugin.homepageURL ? undefined : plugin.repositoryURL,
          kind: 'repository' as const,
        },
        { label: 'README', url: plugin.readmeURL, kind: 'readme' as const },
        { label: 'Git log', url: plugin.gitLogURL, kind: 'git-log' as const },
      ].filter((link) => link.url)
    : [];
  return (
    <section className="neo-extensions-panel">
      <header className="neo-extensions-header">
        <strong>Plugin Manager</strong>
        <span className="neo-extensions-count" data-neo-ui-part="count">
          {model.count}
        </span>
        <input
          className="neo-extensions-input"
          data-neo-ui-part="input"
          type="text"
          placeholder="Filter installed plugins"
          autoComplete="off"
          spellCheck={false}
          defaultValue={model.query}
        />
      </header>
      <div className="neo-extensions-content">
        <div
          className="neo-extensions-list"
          data-neo-ui-part="list"
          tabIndex={-1}
          style={{
            color:
              model.listStatus === 'error'
                ? THEME_VARS.error
                : model.listStatus === 'muted'
                  ? THEME_VARS.muted
                  : THEME_VARS.text,
          }}
        >
          {model.listMessage ||
            model.plugins.map((item, index) => (
              <div
                key={item.id}
                data-zv-plugin-index={index}
                className={`neo-extensions-row${index === model.selected ? ' selected' : ''}`}
                onClick={() => dispatch({ type: 'select', index })}
              >
                <span style={{ color: item.enabled ? THEME_VARS.success : THEME_VARS.muted }}>
                  {item.enabled ? '●' : '○'}
                </span>
                <span
                  style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                  {item.name}
                </span>
                <span style={{ color: THEME_VARS.muted, fontSize: '11px' }}>
                  {item.version || '—'}
                </span>
              </div>
            ))}
        </div>
        <div className="neo-extensions-details" data-neo-ui-part="details" tabIndex={-1}>
          {!plugin ? (
            model.loading ? (
              'Loading plugin details…'
            ) : (
              'No plugin selected.'
            )
          ) : (
            <>
              <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '18px' }}>
                {plugin.name}
              </div>
              <div
                style={{
                  display: 'inline-block',
                  marginBottom: '18px',
                  padding: '3px 8px',
                  borderRadius: '999px',
                  color: plugin.enabled ? THEME_VARS.success : THEME_VARS.muted,
                  border: `1px solid ${plugin.enabled ? THEME_VARS.success : THEME_VARS.border}`,
                }}
              >
                {plugin.installed === false
                  ? 'Not installed'
                  : plugin.enabled
                    ? 'Enabled'
                    : 'Disabled'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: '8px 14px' }}>
                {[
                  ['Version', plugin.version || 'Unknown'],
                  ...(plugin.pendingRestart
                    ? [['Pending', 'Restart required to finish installation or update']]
                    : []),
                  ['Plugin ID', plugin.id],
                  ['Settings', plugin.preferencePaneID ? 'Available' : 'Not registered'],
                ].map(([label, value]) => (
                  <React.Fragment key={label}>
                    <span style={{ color: THEME_VARS.muted }}>{label}</span>
                    <span style={{ overflowWrap: 'anywhere' }}>{value}</span>
                  </React.Fragment>
                ))}
              </div>
              <div
                style={{
                  marginTop: '18px',
                  paddingTop: '16px',
                  borderTop: `1px solid ${THEME_VARS.border}`,
                  color: plugin.description ? THEME_VARS.text : THEME_VARS.muted,
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere',
                }}
              >
                {plugin.description || 'No description provided by the plugin.'}
              </div>
              {links.length > 0 && (
                <div className="neo-extensions-links">
                  {links.map((link) => (
                    <button
                      key={link.kind}
                      type="button"
                      title={link.url}
                      onClick={() => dispatch({ type: 'link', kind: link.kind })}
                    >
                      {link.label}
                    </button>
                  ))}
                </div>
              )}
              {model.canCancel && (
                <button type="button" onClick={() => dispatch({ type: 'cancel' })}>
                  Cancel download
                </button>
              )}
              <div
                style={{
                  marginTop: '24px',
                  paddingTop: '16px',
                  borderTop: `1px solid ${THEME_VARS.border}`,
                  color: THEME_VARS.muted,
                }}
              >
                {model.shortcuts}
              </div>
            </>
          )}
        </div>
      </div>
      <footer className="neo-extensions-footer" data-neo-ui-part="footer">
        {model.footer}
      </footer>
    </section>
  );
}

export function mountExtensionsReactView(
  root: HTMLElement,
  initialModel: ExtensionsReactModel,
  dispatch: (command: ExtensionsReactCommand) => void,
): ReactView<ExtensionsReactModel> {
  return createReactView(
    root,
    (model) => <ExtensionsView model={model} dispatch={dispatch} />,
    initialModel,
  );
}
