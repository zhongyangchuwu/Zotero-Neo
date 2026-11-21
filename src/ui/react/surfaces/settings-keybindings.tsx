import { React } from '../runtime';
import type { KeyboardEvent } from 'react';
import { KEY_GUIDE_NUMBER_SPECS, normalizeKeyGuideNumber } from '../../../core/preferences';
import { compositionOwnsKey } from '../../../input/composition';
import type { ShortcutCatalogEntry } from '../../../input/shortcut-catalog';
import type {
  KeybindingsPageCommand,
  KeybindingsPageModel,
} from '../../../main/settings-keybindings-model';

interface KeybindingsPageProps {
  readonly model: KeybindingsPageModel;
  readonly dispatch: (command: KeybindingsPageCommand) => void;
}

type ShortcutEdit = NonNullable<KeybindingsPageModel['edit']>;

export function KeybindingsPage({ model, dispatch }: KeybindingsPageProps) {
  const [query, setQuery] = React.useState('');
  const [context, setContext] = React.useState('all');
  const [group, setGroup] = React.useState('all');
  const [availability, setAvailability] = React.useState('all');
  const searchInput = React.useRef<HTMLInputElement>(null);
  const editorInput = React.useRef<HTMLElement | null>(null);
  const returnFocus = React.useRef<{ trigger: HTMLElement; summary: HTMLElement | null } | null>(
    null,
  );
  const composing = React.useRef(false);
  const hintId = React.useId();
  const focusInput = React.useCallback((node: HTMLElement | null) => {
    editorInput.current = node;
    composing.current = false;
    node?.focus();
  }, []);
  React.useLayoutEffect(() => {
    if (model.edit || !returnFocus.current) return;
    const { trigger, summary } = returnFocus.current;
    returnFocus.current = null;
    const doc = searchInput.current?.ownerDocument;
    const active = doc?.activeElement;
    if (active && active !== doc?.body && active !== doc?.documentElement) return;
    if (trigger.isConnected) trigger.focus();
    else if (summary?.isConnected) summary.focus();
    else searchInput.current?.focus();
  }, [model.edit]);
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
    const bound = entry.keys.length > 0;
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
  const renderEdit = (edit: ShortcutEdit) => {
    const recording = edit.mode === 'recording';
    const hint = text(
      recording
        ? 'Type the shortcut. Backspace removes a key; Enter saves; Esc cancels.'
        : 'Type a key sequence such as <Space>ff. Enter saves; Esc cancels.',
    );
    const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      if (compositionOwnsKey(event.nativeEvent, composing.current)) return;
      const plain = !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
      const key = event.key;
      let command: KeybindingsPageCommand;
      if (key === 'Escape' && plain) command = { type: 'cancel-edit' };
      else if (
        event.target !== editorInput.current ||
        (key === 'Tab' && !event.ctrlKey && !event.altKey && !event.metaKey)
      )
        return;
      else if (key === 'Enter' && plain) command = { type: 'save-edit' };
      else if (recording && key === 'Backspace' && plain) command = { type: 'pop-key' };
      else if (recording)
        command = {
          type: 'record-key',
          event: {
            key,
            ctrlKey: event.ctrlKey,
            altKey: event.altKey,
            metaKey: event.metaKey,
            shiftKey: event.shiftKey,
          },
        };
      else return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat || command.type === 'pop-key') dispatch(command);
    };
    const overwrite = edit.exact;
    return (
      <div
        className="kb-recorder"
        data-neo-ui-key-scope="recorder"
        onKeyDown={keyDown}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
        }}
      >
        <p id={hintId}>{hint}</p>
        {recording ? (
          <div
            ref={focusInput}
            className="kb-recorder-target"
            tabIndex={0}
            role="group"
            aria-describedby={hintId}
          >
            <code>{edit.sequence || '—'}</code>
          </div>
        ) : (
          <input
            ref={focusInput}
            className="kb-recorder-target"
            type="text"
            aria-label={text('Edit expression')}
            aria-describedby={hintId}
            aria-invalid={!!edit.error}
            value={edit.sequence}
            spellCheck={false}
            onChange={(event) => dispatch({ type: 'expression', value: event.currentTarget.value })}
          />
        )}
        <div role="status">
          {edit.error && <p className="kb-error">{edit.error}</p>}
          {edit.warning && <p className="kb-warning">{edit.warning}</p>}
        </div>
        <div className="kb-row">
          <button type="button" onClick={() => dispatch({ type: 'toggle-expression' })}>
            {text(recording ? 'Edit expression' : 'Record keys')}
          </button>
          {overwrite ? (
            <button type="button" onClick={() => dispatch({ type: 'save-edit', overwrite })}>
              {text('Overwrite existing shortcut')}
            </button>
          ) : (
            <button
              type="button"
              disabled={!edit.canSave}
              onClick={() => dispatch({ type: 'save-edit' })}
            >
              {text('Save shortcut')}
            </button>
          )}
          <button type="button" onClick={() => dispatch({ type: 'cancel-edit' })}>
            {text('Cancel')}
          </button>
        </div>
      </div>
    );
  };
  const renderEntry = (entry: ShortcutCatalogEntry) => {
    const { context, action } = entry;
    const edit =
      model.edit?.context === context && model.edit.action === action ? model.edit : null;
    const notice =
      model.notice?.context === context && model.notice.action === action ? model.notice : null;
    const startEdit = (trigger: HTMLElement, previous: string | null) => {
      returnFocus.current = {
        trigger,
        summary: trigger.closest('.kb-action')?.querySelector('summary') ?? null,
      };
      dispatch({ type: 'record', context, action, previous });
    };
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
          {!entry.keys.length && <p>{text('No shortcut is assigned in this context.')}</p>}
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
          {!!entry.keys.length && (
            <p>
              <strong>{text('Current shortcuts')}</strong>
            </p>
          )}
          {entry.keys.map((key) => (
            <div key={key}>
              <div className="kb-row">
                <button
                  type="button"
                  aria-label={`${text('Record keys')}: ${entry.label} (${contextName(context)}) ${key}`}
                  onClick={(event) => startEdit(event.currentTarget, key)}
                >
                  <kbd>{key}</kbd>
                </button>
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'delete-row', context, action, previous: key })}
                >
                  {text('Delete binding')}
                </button>
              </div>
              {edit?.previous === key && renderEdit(edit)}
            </div>
          ))}
          <div className="kb-row">
            <button type="button" onClick={(event) => startEdit(event.currentTarget, null)}>
              {text('Add shortcut')}
            </button>
            <button type="button" onClick={() => dispatch({ type: 'unbind', context, action })}>
              {text('Unbind this action')}
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'reset-action', context, action })}
            >
              {text('Reset this action')}
            </button>
          </div>
          {edit?.previous === null && renderEdit(edit)}
          {notice && (
            <p role="status" className="kb-error">
              {notice.text}
            </p>
          )}
        </section>
      </details>
    );
  };
  return (
    <div className="neo-settings-keybindings">
      <h3>{text('Shortcut browser')}</h3>
      <div className="kb-toolbar">
        <input
          ref={searchInput}
          type="search"
          aria-label={text('Search shortcuts')}
          placeholder={text('Search actions, IDs, keys, and contexts')}
          value={query}
          onChange={(event) => {
            if (model.edit) dispatch({ type: 'cancel-edit' });
            setQuery(event.currentTarget.value);
          }}
        />
        <select
          aria-label={text('All contexts')}
          value={context}
          onChange={(event) => {
            if (model.edit) dispatch({ type: 'cancel-edit' });
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
            if (model.edit) dispatch({ type: 'cancel-edit' });
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
            if (model.edit) dispatch({ type: 'cancel-edit' });
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
        {!!model.unavailable.length && (
          <section className="kb-invalid">
            <h4>{text('Unavailable shortcuts')}</h4>
            {model.unavailable.map((row) => (
              <div className="kb-row" key={`${row.context}:${row.previous}`}>
                <code>{row.previous}</code> — {contextName(row.context)}: {row.action}
                <button type="button" onClick={() => dispatch({ type: 'delete-row', ...row })}>
                  {text('Delete binding')}
                </button>
                {model.notice?.context === row.context && model.notice.action === row.action && (
                  <p role="status" className="kb-error">
                    {model.notice.text}
                  </p>
                )}
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
.neo-settings-keybindings .kb-toolbar, .neo-settings-keybindings .kb-row { display:flex; align-items:center; flex-wrap:wrap; gap:.55em; }
.neo-settings-keybindings .kb-toolbar input { width:min(32em, 100%); }
.neo-settings-keybindings .kb-scroll { max-height:55vh; overflow:auto; scrollbar-gutter:stable; }
.neo-settings-keybindings .kb-action, .neo-settings-keybindings .kb-invalid, .neo-settings-keybindings .kb-recorder { margin:.25em 0; padding:.45em .6em; border:1px solid var(--zotero-neo-border); border-radius:var(--neo-radius-small); }
.neo-settings-keybindings summary { cursor:pointer; }
.neo-settings-keybindings .kb-action summary > * { margin-inline-end:.55em; }
.neo-settings-keybindings .kb-detail { padding:.55em 0; border-top:1px solid var(--zotero-neo-border); }
.neo-settings-keybindings .kb-detail h5, .neo-settings-keybindings .kb-detail p { margin:.2em 0; }
.neo-settings-keybindings .kb-row { margin:.35em 0; }
.neo-settings-keybindings .kb-recorder-target { box-sizing:border-box; min-height:2.3em; width:100%; padding:.35em .55em; border:1px solid var(--zotero-neo-border); }
.neo-settings-keybindings .kb-error { color:var(--zotero-neo-error); }
.neo-settings-keybindings .kb-warning { color:var(--zotero-neo-warning); }
.neo-settings-keybindings .kb-guide { margin:1em 0 1.5em; }
.neo-settings-keybindings .kb-guide-number { display:block; margin:.5em 0; }
`;
