import { React } from '../runtime';
import type { KeyboardEvent } from 'react';
import { KEY_GUIDE_NUMBER_SPECS, normalizeKeyGuideNumber } from '../../../core/preferences';
import type { BindingEditorIssue } from '../../../input/binding-editor';
import type { ShortcutCatalogEntry } from '../../../input/shortcut-catalog';
import type {
  KeybindingsPageCommand,
  KeybindingsPageModel,
} from '../../../main/settings-keybindings-model';

interface KeybindingsPageProps {
  readonly model: KeybindingsPageModel;
  readonly dispatch: (command: KeybindingsPageCommand) => void;
}

const ISSUE_MESSAGES: Record<BindingEditorIssue['kind'], string> = {
  empty: 'Enter a key sequence and action.',
  malformed: 'Invalid mode, key sequence, or action.',
  incompatible: 'Action is not supported in this mode.',
  duplicate: 'Duplicate mode and key sequence.',
  prefix: 'Strict prefix of another sequence.',
  native: 'Native key is reserved by Zotero or text editing.',
};

export function KeybindingsPage({ model, dispatch }: KeybindingsPageProps) {
  const [query, setQuery] = React.useState('');
  const [context, setContext] = React.useState('all');
  const [group, setGroup] = React.useState('all');
  const [availability, setAvailability] = React.useState('all');
  const focusRecorder = React.useCallback((node: HTMLDivElement | null) => {
    node?.focus();
  }, []);
  const text = (key: string) => model.labels[key] ?? key;
  const contextName = (value: string) =>
    model.contexts.find((item) => item.value === value)?.label ?? value;
  const groupName = (value: string) =>
    model.groups.find((item) => item.value === value)?.label ?? value;
  const needle = query.trim().toLowerCase();
  const matches = (values: readonly string[]) =>
    !needle || values.some((value) => value.toLowerCase().includes(needle));
  const records = model.catalog.filter((entry) => {
    if (context !== 'all' && entry.context !== context) return false;
    if (group !== 'all' && entry.group !== group) return false;
    const bound = model.rows.some(
      (row) => row.mode === entry.context && row.action === entry.action && !!row.key,
    );
    return (
      (availability === 'all' || (availability === 'bound') === bound) &&
      matches([
        entry.label,
        entry.action,
        entry.group,
        groupName(entry.group),
        entry.context,
        contextName(entry.context),
        ...entry.keys,
        ...entry.defaultKeys,
      ])
    );
  });
  const native = model.native.filter(
    (entry) =>
      group === 'all' &&
      (context === 'all' || entry.context === context) &&
      matches([entry.key, entry.label, entry.context, contextName(entry.context)]),
  );
  const orphanRows = model.rows.filter(
    (row) =>
      !model.catalog.some((entry) => entry.context === row.mode && entry.action === row.action),
  );
  const issues = (rowId: number) => {
    const errors = model.errors.filter((issue) => issue.rowId === rowId);
    const warnings = model.warnings.filter((issue) => issue.rowId === rowId);
    return errors.length || warnings.length ? (
      <ul className={errors.length ? 'kb-error' : 'kb-warning'}>
        {[...errors, ...warnings].map((issue, index) => (
          <li key={`${issue.kind}-${index}`}>{text(ISSUE_MESSAGES[issue.kind])}</li>
        ))}
      </ul>
    ) : null;
  };
  const recorderKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const nativeEvent = event.nativeEvent;
    if (
      event.key === 'Tab' ||
      nativeEvent.isComposing ||
      event.key === 'Process' ||
      nativeEvent.keyCode === 229
    )
      return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      nativeEvent.stopImmediatePropagation();
      dispatch({ type: 'cancel-recording' });
      return;
    }
    if (['Control', 'Alt', 'Meta', 'Shift', 'CapsLock', 'Dead', 'Unidentified'].includes(event.key))
      return;
    event.preventDefault();
    event.stopPropagation();
    nativeEvent.stopImmediatePropagation();
    dispatch({
      type: 'record-key',
      event: {
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
      },
    });
  };
  const renderEntry = (entry: ShortcutCatalogEntry) => {
    const rows = model.rows.filter(
      (row) => row.mode === entry.context && row.action === entry.action,
    );
    const recording =
      model.recording?.context === entry.context && model.recording.action === entry.action
        ? model.recording
        : null;
    return (
      <details
        key={`${entry.context}:${entry.action}`}
        open={needle ? true : undefined}
        className="kb-action"
      >
        <summary>
          <strong>{entry.label}</strong> <code>{entry.action}</code>{' '}
          <span>{contextName(entry.context)}</span>
        </summary>
        <section className="kb-detail">
          <h5>{contextName(entry.context)}</h5>
          <p>
            <strong>{text('Current shortcuts')}: </strong>
            {rows.length
              ? rows.map((row, index) => (
                  <React.Fragment key={row.id}>
                    {index ? ', ' : ''}
                    <kbd>{row.key || '—'}</kbd>
                  </React.Fragment>
                ))
              : text('No shortcut is assigned in this context.')}
          </p>
          <p>
            <strong>{text('Default shortcuts')}: </strong>
            {entry.defaultKeys.length
              ? entry.defaultKeys.map((key, index) => (
                  <React.Fragment key={key}>
                    {index ? ', ' : ''}
                    <kbd>{key}</kbd>
                  </React.Fragment>
                ))
              : text('Unbound')}
          </p>
          <p>
            {text('Origin')}:{' '}
            {text(
              entry.source === 'default'
                ? 'Default'
                : entry.source === 'custom'
                  ? 'Custom'
                  : 'Unbound',
            )}
          </p>
          {rows.map((row) => (
            <div className="kb-row" key={row.id}>
              <kbd>{row.key || '—'}</kbd>
              <button
                type="button"
                aria-label={`${text('Record keys')}: ${entry.label} (${contextName(entry.context)}) ${row.key}`}
                onClick={() =>
                  dispatch({
                    type: 'record',
                    context: entry.context,
                    action: entry.action,
                    rowId: row.id,
                  })
                }
              >
                {text('Record keys')}
              </button>
              <button type="button" onClick={() => dispatch({ type: 'delete-row', rowId: row.id })}>
                {text('Delete binding')}
              </button>
              {issues(row.id)}
            </div>
          ))}
          <div className="kb-row">
            <button
              type="button"
              onClick={() =>
                dispatch({
                  type: 'record',
                  context: entry.context,
                  action: entry.action,
                  rowId: null,
                })
              }
            >
              {text('Add shortcut')}
            </button>
            <button
              type="button"
              onClick={() =>
                dispatch({ type: 'unbind', context: entry.context, action: entry.action })
              }
            >
              {text('Unbind this action')}
            </button>
            <button
              type="button"
              onClick={() =>
                dispatch({ type: 'reset-action', context: entry.context, action: entry.action })
              }
            >
              {text('Reset this action')}
            </button>
          </div>
          {recording && (
            <div className="kb-recorder">
              <p>{text('Recording keys — press keys in order, then choose Done')}</p>
              <div
                ref={focusRecorder}
                className="kb-recorder-target"
                data-neo-ui-key-scope="recorder"
                tabIndex={0}
                role="group"
                aria-label={text('Recording keys — press keys in order, then choose Done')}
                onKeyDownCapture={recorderKeyDown}
              >
                <code>{recording.sequence || '—'}</code>
              </div>
              <p role="status">
                {recording.sequence ? text('Shortcut recorded; choose Done to keep it.') : ''}
              </p>
              <div className="kb-row">
                <button
                  type="button"
                  disabled={!recording.sequence}
                  onClick={() => dispatch({ type: 'finish-recording' })}
                >
                  {text('Done')}
                </button>
                <button type="button" onClick={() => dispatch({ type: 'cancel-recording' })}>
                  {text('Cancel')}
                </button>
              </div>
            </div>
          )}
        </section>
      </details>
    );
  };
  return (
    <div className="neo-settings-keybindings">
      <h2>{text('Keybindings')}</h2>
      <h3>{text('Shortcut browser')}</h3>
      <div className="kb-toolbar">
        <input
          type="search"
          aria-label={text('Search shortcuts')}
          placeholder={text('Search actions, IDs, keys, and contexts')}
          value={query}
          onChange={(event) => {
            if (model.recording) dispatch({ type: 'cancel-recording' });
            setQuery(event.currentTarget.value);
          }}
        />
        <select
          aria-label={text('All contexts')}
          value={context}
          onChange={(event) => {
            if (model.recording) dispatch({ type: 'cancel-recording' });
            setContext(event.currentTarget.value);
          }}
        >
          <option value="all">{text('All contexts')}</option>
          {model.contexts.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <select
          aria-label={text('All groups')}
          value={group}
          onChange={(event) => {
            if (model.recording) dispatch({ type: 'cancel-recording' });
            setGroup(event.currentTarget.value);
          }}
        >
          <option value="all">{text('All groups')}</option>
          {model.groups.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <select
          aria-label={text('Show bound and unbound')}
          value={availability}
          onChange={(event) => {
            if (model.recording) dispatch({ type: 'cancel-recording' });
            setAvailability(event.currentTarget.value);
          }}
        >
          <option value="all">{text('Show bound and unbound')}</option>
          <option value="bound">{text('Bound actions')}</option>
          <option value="unbound">{text('Unbound actions')}</option>
        </select>
      </div>
      <p role="status">
        {text('Search results')}: {records.length + native.length}
      </p>
      <div className="kb-footer">
        <span role="status" className={model.errors.length ? 'kb-error' : 'kb-warning'}>
          {model.errors.length
            ? text('Fix invalid rows before applying.')
            : model.warnings.length
              ? text('Prefix conflicts detected; Apply is allowed.')
              : model.dirty
                ? text('Unsaved changes')
                : ''}
        </span>
        <button
          type="button"
          disabled={!model.canApply}
          onClick={() => dispatch({ type: 'apply' })}
        >
          {text('Apply bindings')}
        </button>
        <span role="status">
          {model.saveOutcome === 'saved'
            ? text('Saved.')
            : model.saveOutcome === 'save-failed'
              ? text('Could not save bindings.')
              : model.status}
        </span>
      </div>
      <div className="kb-scroll" tabIndex={0} role="region" aria-label={text('Search results')}>
        {model.groups.map((item) => {
          const entries = records
            .filter((entry) => entry.group === item.value)
            .slice()
            .sort(
              (a, b) =>
                a.label.localeCompare(b.label) ||
                a.action.localeCompare(b.action) ||
                contextName(a.context).localeCompare(contextName(b.context)),
            );
          return entries.length ? (
            <section key={item.value}>
              <h4>{item.label}</h4>
              {entries.map(renderEntry)}
            </section>
          ) : null;
        })}
        {!records.length && !native.length && <p>{text('No matching actions.')}</p>}
        {!!orphanRows.length && (
          <section className="kb-invalid">
            <h4>{text('Fix invalid rows before applying.')}</h4>
            {orphanRows.map((row) => (
              <div className="kb-row" key={row.id}>
                <code>
                  {row.mode}:{row.key} → {row.action}
                </code>
                {issues(row.id)}
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'delete-row', rowId: row.id })}
                >
                  {text('Delete binding')}
                </button>
              </div>
            ))}
          </section>
        )}
        {!!native.length && (
          <details open={needle || context !== 'all' ? true : undefined}>
            <summary>
              {text('Native shortcuts')} —{' '}
              {text('Read-only; Zotero or the operating system owns these keys.')}
            </summary>
            <ul>
              {native.map((entry, index) => (
                <li key={`${entry.context}:${entry.key}:${index}`}>
                  <kbd>{entry.key}</kbd> — {contextName(entry.context)}: {entry.label}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
      <details className="kb-guide">
        <summary>{text('Prefix Guide')}</summary>
        <p>{text('Show valid continuations while a multi-key command prefix is pending.')}</p>
        <label>
          <input
            type="checkbox"
            checked={model.guide.enabled}
            onChange={(event) =>
              dispatch({ type: 'guide-enabled', value: event.currentTarget.checked })
            }
          />{' '}
          {text('Show Prefix Guide')}
        </label>
        {(['delayMs', 'fontSizePx'] as const).map((setting) => (
          <label className="kb-guide-number" key={setting}>
            {text(setting === 'delayMs' ? 'Display delay (ms)' : 'Font size (px)')}{' '}
            <input
              key={`${setting}:${model.guide[setting]}`}
              type="number"
              min={KEY_GUIDE_NUMBER_SPECS[setting].minimum}
              max={KEY_GUIDE_NUMBER_SPECS[setting].maximum}
              defaultValue={model.guide[setting]}
              step={setting === 'delayMs' ? 25 : 1}
              onBlur={(event) => {
                const input = event.currentTarget;
                const value =
                  input.value !== '' && Number.isFinite(input.valueAsNumber)
                    ? normalizeKeyGuideNumber(setting, input.valueAsNumber)
                    : null;
                input.value = String(model.guide[setting]);
                if (value !== null) dispatch({ type: 'guide-number', setting, value });
              }}
            />
          </label>
        ))}
        <p role="status" className="kb-error">
          {model.guide.error}
        </p>
      </details>
    </div>
  );
}

export const KEYBINDINGS_REACT_CSS = `
.neo-settings-keybindings { overflow:auto; padding:16px 20px; }
.neo-settings-keybindings h2 { margin:0 0 .55em; font-size:1.55em; }
.neo-settings-keybindings .kb-toolbar, .neo-settings-keybindings .kb-row, .neo-settings-keybindings .kb-footer { display:flex; align-items:center; flex-wrap:wrap; gap:.55em; }
.neo-settings-keybindings .kb-toolbar input { width:min(32em, 100%); }
.neo-settings-keybindings .kb-footer { position:sticky; top:0; z-index:1; justify-content:flex-end; padding:.65em 0; background:var(--zotero-neo-surface); border-bottom:1px solid var(--zotero-neo-border); }
.neo-settings-keybindings .kb-scroll { max-height:55vh; overflow:auto; scrollbar-gutter:stable; }
.neo-settings-keybindings .kb-action, .neo-settings-keybindings .kb-invalid, .neo-settings-keybindings .kb-recorder { margin:.25em 0; padding:.45em .6em; border:1px solid var(--zotero-neo-border); border-radius:5px; }
.neo-settings-keybindings summary { cursor:pointer; }
.neo-settings-keybindings .kb-action summary > * { margin-inline-end:.55em; }
.neo-settings-keybindings .kb-detail { padding:.55em 0; border-top:1px solid var(--zotero-neo-border); }
.neo-settings-keybindings .kb-detail h5, .neo-settings-keybindings .kb-detail p { margin:.2em 0; }
.neo-settings-keybindings .kb-row { margin:.35em 0; }
.neo-settings-keybindings .kb-recorder-target { min-height:2.3em; padding:.35em .55em; border:1px solid var(--zotero-neo-border); }
.neo-settings-keybindings .kb-error { color:var(--zotero-neo-error); }
.neo-settings-keybindings .kb-warning { color:var(--zotero-neo-warning); }
.neo-settings-keybindings .kb-guide { margin:1em 0 1.5em; }
.neo-settings-keybindings .kb-guide-number { display:block; margin:.5em 0; }
`;
