import { React } from '../runtime';
import { createReactView } from '../view';
import { Button, Field, Kbd, Status } from '../components';
import type { ReactView } from '../types';
import type {
  SettingsFormCommand,
  SettingsFormField,
  SettingsFormModel,
} from '../../../main/settings-form-model';
import type { SettingsReactCommand, SettingsReactModel } from '../../../main/settings-react-model';
import { AppearancePage, APPEARANCE_REACT_CSS } from './settings-appearance';
import { KeybindingsPage, KEYBINDINGS_REACT_CSS } from './settings-keybindings';
import { ReaderPage, READER_REACT_CSS } from './settings-reader';

function FormControl({
  field,
  dispatch,
}: {
  field: SettingsFormField;
  dispatch: (command: SettingsFormCommand) => void;
}) {
  const value = 'value' in field ? field.value : '';
  const [raw, setRaw] = React.useState(String(value));
  const currentValue = React.useRef(value);
  currentValue.current = value;
  React.useEffect(() => setRaw(String(value)), [field.id, value]);
  const commit = (next: string): void => {
    if (field.kind === 'number') {
      const number = Number(next);
      if (!next.trim() || !Number.isFinite(number)) {
        setRaw(String(currentValue.current));
        return;
      }
      dispatch({ type: 'value', id: field.id, value: number });
    } else if (field.kind === 'text') {
      dispatch({ type: 'value', id: field.id, value: next });
    }
    setRaw(String(currentValue.current));
  };
  if (field.kind === 'boolean')
    return (
      <input
        type="checkbox"
        aria-label={field.label}
        checked={field.value}
        disabled={field.disabled}
        onChange={(event) =>
          dispatch({ type: 'value', id: field.id, value: event.currentTarget.checked })
        }
      />
    );
  if (field.kind === 'choice')
    return (
      <select
        aria-label={field.label}
        value={field.value}
        disabled={field.disabled}
        onChange={(event) =>
          dispatch({ type: 'value', id: field.id, value: event.currentTarget.value })
        }
      >
        {field.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  if (field.kind === 'action')
    return (
      <Button
        primary={field.primary}
        disabled={field.disabled}
        onClick={() => dispatch({ type: 'action', id: field.id })}
      >
        {field.label}
      </Button>
    );
  const change = (next: string): void => {
    setRaw(next);
    if (field.kind === 'text' && field.commit === 'input') commit(next);
  };
  if (field.kind === 'text' && field.multiline)
    return (
      <textarea
        aria-label={field.label}
        placeholder={field.placeholder}
        disabled={field.disabled}
        aria-invalid={field.invalid || undefined}
        value={raw}
        onChange={(event) => change(event.currentTarget.value)}
        onBlur={(event) => {
          if (field.commit !== 'input') commit(event.currentTarget.value);
        }}
      />
    );
  return (
    <input
      type={field.kind === 'number' ? 'number' : 'text'}
      aria-label={field.label}
      placeholder={field.kind === 'text' ? field.placeholder : undefined}
      disabled={field.disabled}
      aria-invalid={field.kind === 'text' ? field.invalid || undefined : undefined}
      min={field.kind === 'number' ? field.minimum : undefined}
      max={field.kind === 'number' ? field.maximum : undefined}
      step={field.kind === 'number' ? field.step : undefined}
      value={raw}
      onChange={(event) => change(event.currentTarget.value)}
      onBlur={(event) => {
        if (field.kind !== 'text' || field.commit !== 'input') commit(event.currentTarget.value);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
          event.preventDefault();
          commit(event.currentTarget.value);
        }
      }}
    />
  );
}

function SettingsForm({
  model,
  dispatch,
}: {
  model: SettingsFormModel;
  dispatch: (command: SettingsFormCommand) => void;
}) {
  return (
    <div className="neo-settings-form">
      <h2>{model.title}</h2>
      {model.description && <p className="neo-muted">{model.description}</p>}
      {model.groups.map((group) => (
        <section key={group.id} className="neo-settings-group">
          <div className="neo-settings-group-heading">
            <h3>{group.title}</h3>
            {group.description && <p className="neo-muted">{group.description}</p>}
          </div>
          <div className="neo-settings-fields">
            {group.fields.map((field) =>
              field.kind === 'action' ? (
                <div key={field.id} className="neo-settings-action">
                  <FormControl field={field} dispatch={dispatch} />
                  {field.description && <p className="neo-muted">{field.description}</p>}
                  {field.note && <p className="neo-muted">{field.note}</p>}
                </div>
              ) : (
                <Field key={field.id} label={field.label} description={field.description}>
                  <div className="neo-settings-field-body">
                    <FormControl field={field} dispatch={dispatch} />
                    {field.note && <span className="neo-muted">{field.note}</span>}
                  </div>
                </Field>
              ),
            )}
          </div>
        </section>
      ))}
      {model.status?.text && <Status error={model.status.error}>{model.status.text}</Status>}
    </div>
  );
}

export const SETTINGS_REACT_CSS = `
.neo-settings { display:grid; grid-template-columns:190px minmax(0,1fr); height:100%; min-height:0; background:var(--zotero-neo-surface); }
.neo-settings-navigation { display:flex; flex-direction:column; gap:4px; padding:20px 12px; border-right:1px solid var(--zotero-neo-border); background:var(--zotero-neo-elevated); min-width:0; overflow:auto; }
.neo-settings-brand { padding:0 10px 17px; font-weight:700; font-size:1.1em; }
.neo-settings-navigation button { display:block; width:100%; text-align:start; border:1px solid transparent; background:transparent; padding:8px 10px; min-height:34px; }
.neo-settings-navigation button[aria-current=page] { color:var(--zotero-neo-selected-text); background:var(--zotero-neo-selected); border-color:var(--zotero-neo-border); font-weight:600; }
.neo-settings-main { display:flex; flex-direction:column; min-height:0; min-width:0; }
.neo-settings-header { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:16px 20px; border-bottom:1px solid var(--zotero-neo-border); }
.neo-settings-header h1 { margin:0; outline:none; }
.neo-settings-header button { display:flex; gap:9px; align-items:center; }
.neo-settings-page { flex:1; min-height:0; min-width:0; overflow:auto; overscroll-behavior:contain; padding:20px; }
.neo-settings-group { margin-bottom:20px; }
.neo-settings-group-heading h3 { margin-bottom:5px; }
.neo-settings-fields { border:1px solid var(--zotero-neo-border); border-radius:6px; overflow:hidden; }
.neo-settings-field-body { display:flex; flex-direction:column; gap:5px; min-width:0; max-width:420px; }
.neo-settings-field-body input:not([type=checkbox]), .neo-settings-field-body select, .neo-settings-field-body textarea { width:100%; }
.neo-settings-field-body textarea { min-width:280px; min-height:70px; }
.neo-settings-action { padding:11px 14px; border-bottom:1px solid var(--zotero-neo-border); }
.neo-settings-action:last-child { border-bottom:0; }
.neo-settings-action p { margin:5px 0 0; }
@media(max-width:760px) { .neo-settings { grid-template-columns:145px minmax(0,1fr); } .neo-settings-page { padding:14px; } .neo-settings .neo-field { align-items:flex-start; flex-direction:column; gap:8px; } .neo-settings-field-body { width:100%; } .neo-settings-field-body textarea { min-width:0; } }
${APPEARANCE_REACT_CSS}
${KEYBINDINGS_REACT_CSS}
${READER_REACT_CSS}
`;

export function mountSettingsReactView(
  root: HTMLElement,
  initialModel: SettingsReactModel,
  dispatch: (command: SettingsReactCommand) => void,
): ReactView<SettingsReactModel> {
  return createReactView(
    root,
    (model) => {
      const generation = model.generation;
      const page = model.page;
      return (
        <div className="neo-ui neo-settings">
          <nav className="neo-settings-navigation" aria-label={model.navigationLabel}>
            <div className="neo-settings-brand">Neo</div>
            {model.sections.map((section) => (
              <button
                key={section.id}
                type="button"
                aria-current={section.id === model.section ? 'page' : undefined}
                onClick={() => dispatch({ type: 'section', section: section.id, generation })}
              >
                {section.label}
              </button>
            ))}
          </nav>
          <div className="neo-settings-main">
            <header className="neo-settings-header">
              <h1 data-neo-ui-part="heading" tabIndex={-1}>
                {model.title}
              </h1>
              <Button
                data-neo-ui-part="close"
                aria-label={model.closeLabel}
                onClick={() => dispatch({ type: 'close', generation })}
              >
                {model.closeLabel}
                <Kbd>Esc</Kbd>
              </Button>
            </header>
            <main className="neo-settings-page" data-neo-ui-part="page">
              {page.kind === 'appearance' && (
                <AppearancePage
                  model={page.model}
                  dispatch={(command) => dispatch({ type: 'appearance', command, generation })}
                />
              )}
              {page.kind === 'keybindings' && (
                <KeybindingsPage
                  model={page.model}
                  dispatch={(command) => dispatch({ type: 'keybindings', command, generation })}
                />
              )}
              {page.kind === 'reader' && (
                <ReaderPage
                  model={page.model}
                  dispatch={(command) => dispatch({ type: 'reader', command, generation })}
                />
              )}
              {page.kind === 'form' && (
                <SettingsForm
                  key={model.section}
                  model={page.model}
                  dispatch={(command) => dispatch({ type: 'form', command, generation })}
                />
              )}
            </main>
          </div>
        </div>
      );
    },
    initialModel,
  );
}
