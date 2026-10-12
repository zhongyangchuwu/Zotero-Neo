import { BINDING_CONTEXTS, type BindingContext, type BindingMap } from '../input/bindings';
import { compositionOwnsKey } from '../input/composition';
import {
  addActionBinding,
  deriveBindingEditor,
  resetAction,
  transition,
  unbindAction,
  type BindingEditorDerived,
  type BindingEditorIssue,
  type BindingEditorLanguage,
  type BindingEditorRow,
  type BindingEditorState,
} from '../input/binding-editor';
import { isActionId, type ActionId } from '../input/actions';
import {
  ACTION_GROUPS,
  contextLabel,
  groupLabel,
  nativeShortcutCatalog,
  type ActionGroup,
  type NativeShortcutEntry,
  type ShortcutCatalogEntry,
} from '../input/shortcut-catalog';
import { keyString } from '../input/keys';
import { serializeBindingTokens } from '../input/key-sequence';
import { THEME_VARS } from '../ui/theme';
import { settingsButtonElement, settingsSelectElement, styleSettingsField } from './settings-ui';

const XHTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
type ContextFilter = BindingContext | 'all';
type GroupFilter = ActionGroup | 'all';
type AvailabilityFilter = 'all' | 'bound' | 'unbound';
type BrowserMessage = (message: string, language: BindingEditorLanguage) => string;

export interface ShortcutBrowserOptions {
  readonly document?: Document;
  readonly root?: Element;
  readonly state: BindingEditorState;
  readonly localize?: BrowserMessage;
  readonly onSave?: (bindings: BindingMap) => boolean | void;
  readonly onStateChange?: (state: BindingEditorState, derived: BindingEditorDerived) => void;
}

export interface MountedShortcutBrowser {
  readonly dispose: () => void;
}

interface KeyRecording {
  readonly context: BindingContext;
  readonly action: ActionId;
  readonly rowId: number | null;
  readonly tokens: readonly string[];
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  document: Document,
  localName: K,
): HTMLElementTagNameMap[K] {
  return document.createElementNS(XHTML_NAMESPACE, localName) as HTMLElementTagNameMap[K];
}

function elementFromTarget(target: EventTarget | null): Element | null {
  if (!target || typeof target !== 'object') return null;
  const node = target as Node;
  return node.nodeType === 1 ? (node as Element) : node.parentElement;
}

function issueMessage(
  issue: BindingEditorIssue,
  language: BindingEditorLanguage,
  localize: BrowserMessage,
): string {
  const message =
    issue.kind === 'empty'
      ? 'Enter a key sequence and action.'
      : issue.kind === 'malformed'
        ? 'Invalid mode, key sequence, or action.'
        : issue.kind === 'incompatible'
          ? 'Action is not supported in this mode.'
          : issue.kind === 'duplicate'
            ? 'Duplicate mode and key sequence.'
            : issue.kind === 'prefix'
              ? 'Strict prefix of another sequence.'
              : 'Native key is reserved by Zotero or text editing.';
  return localize(message, language);
}

export function mountShortcutBrowser(options: ShortcutBrowserOptions): MountedShortcutBrowser {
  const resolvedDocument = options.document ?? options.root?.ownerDocument;
  if (!resolvedDocument) throw new Error('Shortcut browser requires a document');
  const document: Document = resolvedDocument;
  const root = options.root ?? document.documentElement;
  const localize = options.localize ?? ((message: string) => message);
  let state = options.state;
  let disposed = false;
  let recording: KeyRecording | null = null;
  let keyListener: EventListener | null = null;
  let keyListenerOnWindow = false;
  let statusMessage = '';
  let contextFilter: ContextFilter = 'all';
  let groupFilter: GroupFilter = 'all';
  let availabilityFilter: AvailabilityFilter = 'all';
  const openActions = new Set<string>();

  const toolbar = createElement(document, 'div');
  toolbar.style.cssText =
    'display:flex;align-items:center;flex-wrap:wrap;gap:0.55em;margin:0 0 0.65em';
  const search = createElement(document, 'input');
  search.type = 'search';
  search.autocomplete = 'off';
  search.setAttribute('aria-label', localize('Search shortcuts', state.language));
  search.placeholder = localize('Search actions, IDs, keys, and contexts', state.language);
  styleSettingsField(search, 'min(32em, 100%)');

  const contexts = [
    { value: 'all' as const, label: localize('All contexts', state.language) },
    ...BINDING_CONTEXTS.map((context) => ({
      value: context,
      label: contextLabel(context, state.language),
    })),
  ];
  const contextSelect = settingsSelectElement<ContextFilter>(
    document,
    localize('All contexts', state.language),
    contexts,
    contextFilter,
    '13em',
  );
  const groups = [
    { value: 'all' as const, label: localize('All groups', state.language) },
    ...ACTION_GROUPS.map((group) => ({ value: group, label: groupLabel(group, state.language) })),
  ];
  const groupSelect = settingsSelectElement<GroupFilter>(
    document,
    localize('All groups', state.language),
    groups,
    groupFilter,
    '12em',
  );
  const availability = settingsSelectElement<AvailabilityFilter>(
    document,
    localize('Show bound and unbound', state.language),
    [
      { value: 'all', label: localize('Show bound and unbound', state.language) },
      { value: 'bound', label: localize('Bound actions', state.language) },
      { value: 'unbound', label: localize('Unbound actions', state.language) },
    ],
    availabilityFilter,
    '13em',
  );
  toolbar.append(search, contextSelect, groupSelect, availability);

  const resultsStatus = createElement(document, 'p');
  resultsStatus.setAttribute('role', 'status');
  resultsStatus.setAttribute('aria-live', 'polite');
  resultsStatus.style.cssText = `margin:0 0 0.5em;color:${THEME_VARS.muted}`;
  const results = createElement(document, 'div');
  results.className = 'zv-shortcut-results';
  const nativeDisclosure = createElement(document, 'details');
  nativeDisclosure.className = 'zv-shortcut-native';
  nativeDisclosure.style.cssText = `margin:0.7em 0;padding:0.55em 0;border-top:1px solid ${THEME_VARS.border}`;
  const resultScroll = createElement(document, 'div');
  resultScroll.className = 'zv-shortcut-scroll';
  resultScroll.style.cssText = 'max-height:55vh;overflow:auto;scrollbar-gutter:stable';
  resultScroll.tabIndex = 0;
  resultScroll.setAttribute('role', 'region');
  resultScroll.setAttribute('aria-label', localize('Search results', state.language));
  resultScroll.append(results, nativeDisclosure);
  const validationStatus = createElement(document, 'p');
  validationStatus.setAttribute('role', 'status');
  validationStatus.setAttribute('aria-live', 'polite');
  validationStatus.style.cssText = 'margin:0;color:' + THEME_VARS.warning;
  const footer = createElement(document, 'div');
  footer.style.cssText = `display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:0.75em;padding:0.65em 0;margin-bottom:0.65em;position:sticky;top:0;z-index:1;background:${THEME_VARS.surface};border-bottom:1px solid ${THEME_VARS.border}`;
  const apply = settingsButtonElement(document, localize('Apply bindings', state.language));
  apply.className = 'zv-shortcut-apply';
  apply.tabIndex = 0;
  const saveStatus = createElement(document, 'span');
  saveStatus.setAttribute('role', 'status');
  saveStatus.setAttribute('aria-live', 'polite');
  footer.append(validationStatus, apply, saveStatus);
  root.replaceChildren(toolbar, resultsStatus, footer, resultScroll);

  function language(): BindingEditorLanguage {
    return state.language;
  }

  function text(message: string): string {
    return localize(message, language());
  }

  function selectedRows(entry: ShortcutCatalogEntry): readonly BindingEditorRow[] {
    return state.rows.filter((row) => row.mode === entry.context && row.action === entry.action);
  }

  function stopKeyCapture(): void {
    if (!keyListener) return;
    if (keyListenerOnWindow && document.defaultView) {
      document.defaultView.removeEventListener('keydown', keyListener, true);
    } else {
      root.removeEventListener('keydown', keyListener, true);
    }
    keyListener = null;
    keyListenerOnWindow = false;
  }

  function cancelRecording(showMessage: boolean): void {
    if (!recording) return;
    stopKeyCapture();
    recording = null;
    if (showMessage) statusMessage = text('Shortcut recording cancelled.');
  }

  function recorderKeydown(event: KeyboardEvent): void {
    const target = elementFromTarget(event.target);
    if (!recording || !target?.closest('.zv-shortcut-recorder-target')) return;
    if (event.key === 'Tab' || compositionOwnsKey(event, false)) return;
    const key = keyString(event);
    if (!key) return;
    const tokens = [...recording.tokens, key];
    const sequence = serializeBindingTokens(tokens);
    if (!sequence) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    recording = { ...recording, tokens };
    const preview = root.querySelector('.zv-shortcut-recorder-sequence');
    if (preview) preview.textContent = sequence;
    const done = root.querySelector(
      'button[data-shortcut-operation="finish-recording"]',
    ) as HTMLButtonElement | null;
    if (done) done.disabled = false;
    const message = root.querySelector('.zv-shortcut-recorder-status');
    if (message) message.textContent = text('Shortcut recorded; choose Done to keep it.');
  }

  function beginRecording(context: BindingContext, action: ActionId, rowId: number | null): void {
    cancelRecording(false);
    statusMessage = '';
    recording = { context, action, rowId, tokens: [] };
    keyListener = (event) => recorderKeydown(event as KeyboardEvent);
    if (document.defaultView) {
      keyListenerOnWindow = true;
      document.defaultView.addEventListener('keydown', keyListener, true);
    } else {
      root.addEventListener('keydown', keyListener, true);
    }
    renderResults();
    (root.querySelector('.zv-shortcut-recorder-target') as HTMLElement | null)?.focus();
  }

  function notify(): BindingEditorDerived {
    const derived = deriveBindingEditor(state);
    options.onStateChange?.(state, derived);
    return derived;
  }

  function actionButton(
    label: string,
    operation: string,
    entry: ShortcutCatalogEntry,
    rowId?: number,
  ): HTMLButtonElement {
    const button = settingsButtonElement(document, label);
    button.tabIndex = 0;
    button.setAttribute('data-shortcut-operation', operation);
    button.setAttribute('data-shortcut-context', entry.context);
    button.setAttribute('data-shortcut-action', entry.action);
    if (rowId !== undefined) button.setAttribute('data-shortcut-row', String(rowId));
    return button;
  }

  function renderIssues(rowId: number, derived: BindingEditorDerived): HTMLElement | null {
    const errors = derived.validation.errors.filter((issue) => issue.rowId === rowId);
    const warnings = derived.validation.warnings.filter((issue) => issue.rowId === rowId);
    if (!errors.length && !warnings.length) return null;
    const list = createElement(document, 'ul');
    list.style.cssText = `margin:0.2em 0 0.4em;padding-left:1.5em;font-size:0.9em;color:${errors.length ? THEME_VARS.error : THEME_VARS.warning}`;
    for (const issue of [...errors, ...warnings]) {
      const message = createElement(document, 'li');
      message.textContent = issueMessage(issue, language(), localize);
      list.append(message);
    }
    return list;
  }

  function renderNativeRows(entries: readonly NativeShortcutEntry[]): HTMLElement {
    const list = createElement(document, 'ul');
    list.style.cssText = 'margin:0.45em 0 0;padding-left:1.5em';
    for (const entry of entries) {
      const item = createElement(document, 'li');
      const key = createElement(document, 'kbd');
      key.textContent = entry.key;
      const detail = createElement(document, 'span');
      detail.textContent = ` — ${contextLabel(entry.context, language())}: ${entry.label}`;
      item.append(key, detail);
      list.append(item);
    }
    return list;
  }

  function renderContext(entry: ShortcutCatalogEntry, derived: BindingEditorDerived): HTMLElement {
    const section = createElement(document, 'section');
    section.style.cssText = `padding:0.55em 0;border-top:1px solid ${THEME_VARS.border}`;
    const heading = createElement(document, 'h5');
    heading.textContent = contextLabel(entry.context, language());
    heading.style.cssText = 'margin:0 0 0.35em;font-size:1em';
    section.append(heading);

    const rows = selectedRows(entry);
    const current = createElement(document, 'p');
    current.style.cssText = 'margin:0.15em 0';
    const currentLabel = createElement(document, 'strong');
    currentLabel.textContent = `${text('Current shortcuts')}: `;
    current.append(currentLabel);
    if (rows.length) {
      rows.forEach((row, index) => {
        if (index) current.append(document.createTextNode(', '));
        const key = createElement(document, 'kbd');
        key.textContent = row.key || '—';
        current.append(key);
      });
    } else {
      current.append(document.createTextNode(text('No shortcut is assigned in this context.')));
    }
    section.append(current);

    const defaults = createElement(document, 'p');
    defaults.style.cssText = 'margin:0.15em 0';
    const defaultLabel = createElement(document, 'strong');
    defaultLabel.textContent = `${text('Default shortcuts')}: `;
    defaults.append(defaultLabel);
    if (entry.defaultKeys.length) {
      entry.defaultKeys.forEach((keyValue, index) => {
        if (index) defaults.append(document.createTextNode(', '));
        const key = createElement(document, 'kbd');
        key.textContent = keyValue;
        defaults.append(key);
      });
    } else {
      defaults.append(document.createTextNode(text('Unbound')));
    }
    section.append(defaults);

    const source = createElement(document, 'p');
    source.style.cssText = 'margin:0.15em 0 0.45em';
    source.textContent = `${text('Origin')}: ${text(entry.source === 'default' ? 'Default' : entry.source === 'custom' ? 'Custom' : 'Unbound')}`;
    section.append(source);

    for (const row of rows) {
      const keyRow = createElement(document, 'div');
      keyRow.style.cssText =
        'display:flex;align-items:center;flex-wrap:wrap;gap:0.45em;margin:0.25em 0';
      const key = createElement(document, 'kbd');
      key.textContent = row.key || '—';
      keyRow.append(key);
      const edit = actionButton(text('Record keys'), 'record', entry, row.id);
      edit.setAttribute(
        'aria-label',
        `${text('Record keys')}: ${entry.label} (${contextLabel(entry.context, language())}) ${row.key}`,
      );
      keyRow.append(edit);
      const issues = renderIssues(row.id, derived);
      if (issues) keyRow.append(issues);
      section.append(keyRow);
    }

    const actions = createElement(document, 'div');
    actions.style.cssText =
      'display:flex;align-items:center;flex-wrap:wrap;gap:0.45em;margin-top:0.45em';
    actions.append(actionButton(text('Add shortcut'), 'add', entry));
    actions.append(actionButton(text('Unbind this action'), 'unbind', entry));
    actions.append(actionButton(text('Reset this action'), 'reset', entry));
    section.append(actions);
    if (recording?.context === entry.context && recording.action === entry.action) {
      const recorder = createElement(document, 'div');
      recorder.className = 'zv-shortcut-recorder';
      recorder.style.cssText = `margin-top:0.6em;padding:0.55em;border:1px solid ${THEME_VARS.accent};border-radius:5px`;
      const instructions = createElement(document, 'p');
      instructions.textContent = text('Recording keys — press keys in order, then choose Done');
      instructions.style.cssText = 'margin:0 0 0.45em';
      const target = createElement(document, 'div');
      target.className = 'zv-shortcut-recorder-target';
      target.tabIndex = 0;
      target.setAttribute('role', 'group');
      target.setAttribute('aria-label', instructions.textContent);
      target.style.cssText = `min-height:2.3em;padding:0.35em 0.55em;border:1px solid ${THEME_VARS.border};border-radius:4px;background:${THEME_VARS.input}`;
      const preview = createElement(document, 'code');
      preview.className = 'zv-shortcut-recorder-sequence';
      preview.textContent = recording.tokens.length
        ? serializeBindingTokens(recording.tokens)
        : '—';
      target.append(preview);
      const recorderStatus = createElement(document, 'p');
      recorderStatus.className = 'zv-shortcut-recorder-status';
      recorderStatus.textContent = recording.tokens.length
        ? text('Shortcut recorded; choose Done to keep it.')
        : '';
      recorderStatus.setAttribute('role', 'status');
      const recorderButtons = createElement(document, 'div');
      recorderButtons.style.cssText = 'display:flex;gap:0.45em;margin-top:0.45em';
      const done = settingsButtonElement(document, text('Done'));
      done.tabIndex = 0;
      done.disabled = recording.tokens.length === 0;
      done.setAttribute('data-shortcut-operation', 'finish-recording');
      const cancel = settingsButtonElement(document, text('Cancel'));
      cancel.tabIndex = 0;
      cancel.setAttribute('data-shortcut-operation', 'cancel-recording');
      recorderButtons.append(done, cancel);
      recorder.append(instructions, target, recorderStatus, recorderButtons);
      section.append(recorder);
    }

    return section;
  }

  function renderAction(
    entry: ShortcutCatalogEntry,
    derived: BindingEditorDerived,
    searchActive: boolean,
  ): HTMLElement {
    const details = createElement(document, 'details');
    const actionKey = `${entry.context}:${entry.action}`;
    details.setAttribute('data-action-key', actionKey);
    details.open = searchActive || openActions.has(actionKey);
    details.addEventListener('toggle', () => {
      if (details.open) openActions.add(actionKey);
      else openActions.delete(actionKey);
    });
    details.style.cssText = `margin:0.25em 0;padding:0.45em 0.6em;border:1px solid ${THEME_VARS.border};border-radius:5px`;
    const summary = createElement(document, 'summary');
    summary.style.cssText = 'display:list-item;cursor:pointer;line-height:1.6';
    const label = createElement(document, 'strong');
    label.textContent = entry.label;
    const id = createElement(document, 'code');
    id.textContent = entry.action;
    const context = createElement(document, 'span');
    context.textContent = contextLabel(entry.context, language());
    summary.append(label, id, context);
    for (const child of Array.from(summary.children))
      (child as HTMLElement).style.marginInlineEnd = '0.55em';
    details.append(summary, renderContext(entry, derived));
    return details;
  }
  function renderOrphanRows(
    knownRowIds: ReadonlySet<number>,
    derived: BindingEditorDerived,
  ): HTMLElement | null {
    const orphanRows = state.rows.filter((row) => !knownRowIds.has(row.id));
    if (!orphanRows.length) return null;
    const section = createElement(document, 'section');
    section.style.cssText = `margin-top:0.8em;padding:0.6em;border:1px solid ${THEME_VARS.error};border-radius:5px`;
    const heading = createElement(document, 'h4');
    heading.textContent = text('Fix invalid rows before applying.');
    section.append(heading);
    for (const row of orphanRows) {
      const item = createElement(document, 'div');
      item.style.cssText =
        'display:flex;align-items:center;flex-wrap:wrap;gap:0.45em;margin:0.35em 0';
      const label = createElement(document, 'code');
      label.textContent = `${row.mode}:${row.key} → ${row.action}`;
      item.append(label);
      const issues = renderIssues(row.id, derived);
      if (issues) item.append(issues);
      const remove = settingsButtonElement(document, text('Delete binding'));
      remove.tabIndex = 0;
      remove.setAttribute('data-shortcut-operation', 'remove-invalid-row');
      remove.setAttribute('data-shortcut-row', String(row.id));
      item.append(remove);
      section.append(item);
    }
    return section;
  }

  function rememberOpenActions(): void {
    for (const details of Array.from(
      results.querySelectorAll('details[data-action-key]'),
    ) as HTMLDetailsElement[]) {
      const actionKey = details.getAttribute('data-action-key');
      if (!actionKey) continue;
      if (details.open) openActions.add(actionKey);
      else openActions.delete(actionKey);
    }
  }

  function renderResults(): void {
    if (disposed) return;
    const focused = elementFromTarget(document.activeElement);
    const restoreFocus = focused?.closest('.zv-shortcut-results') === results;
    const focusKey = focused?.closest('details[data-action-key]')?.getAttribute('data-action-key');
    rememberOpenActions();
    const derived = notify();
    const query = search.value.trim().toLowerCase();
    const records = derived.catalog.filter((entry) => {
      if (contextFilter !== 'all' && entry.context !== contextFilter) return false;
      if (groupFilter !== 'all' && entry.group !== groupFilter) return false;
      const isBound = state.rows.some(
        (row) => row.mode === entry.context && row.action === entry.action && Boolean(row.key),
      );
      if (availabilityFilter === 'bound' && !isBound) return false;
      if (availabilityFilter === 'unbound' && isBound) return false;
      const values = [
        entry.label,
        entry.action,
        entry.group,
        groupLabel(entry.group, language()),
        entry.context,
        contextLabel(entry.context, language()),
        ...entry.keys,
        ...entry.defaultKeys,
      ];
      return !query || values.some((value) => value.toLowerCase().includes(query));
    });
    const nativeEntries = nativeShortcutCatalog(
      contextFilter === 'all' ? undefined : contextFilter,
      language(),
    ).filter((entry) => {
      if (groupFilter !== 'all') return false;
      const values = [
        entry.key,
        entry.label,
        entry.context,
        contextLabel(entry.context, language()),
      ];
      return !query || values.some((value) => value.toLowerCase().includes(query));
    });

    results.replaceChildren();
    const knownRowIds = new Set<number>();
    for (const entry of derived.catalog) {
      for (const row of selectedRows(entry)) knownRowIds.add(row.id);
    }
    const groups = new Map<ActionGroup, Map<ActionId, ShortcutCatalogEntry[]>>();
    for (const entry of records) {
      const group = groups.get(entry.group) ?? new Map<ActionId, ShortcutCatalogEntry[]>();
      const actionEntries = group.get(entry.action) ?? [];
      actionEntries.push(entry);
      group.set(entry.action, actionEntries);
      groups.set(entry.group, group);
    }

    for (const group of ACTION_GROUPS) {
      const actionMap = groups.get(group);
      if (!actionMap?.size) continue;
      const section = createElement(document, 'section');
      section.style.cssText = 'margin:0 0 0.9em';
      const heading = createElement(document, 'h4');
      heading.textContent = groupLabel(group, language());
      heading.style.cssText = 'margin:0.55em 0 0.35em;font-size:1.05em';
      section.append(heading);
      const sorted = [...actionMap.entries()].sort((left, right) => {
        const nameDelta = left[1][0].label.localeCompare(right[1][0].label);
        return nameDelta || left[0].localeCompare(right[0]);
      });
      for (const [, entries] of sorted) {
        entries.sort((left, right) =>
          contextLabel(left.context, language()).localeCompare(
            contextLabel(right.context, language()),
          ),
        );
        for (const entry of entries) {
          section.append(renderAction(entry, derived, Boolean(query)));
        }
      }
      results.append(section);
    }

    const orphanRows = renderOrphanRows(knownRowIds, derived);
    if (orphanRows) results.append(orphanRows);

    nativeDisclosure.replaceChildren();
    if (nativeEntries.length) {
      const summary = createElement(document, 'summary');
      summary.textContent = `${text('Native shortcuts')} — ${text('Read-only; Zotero or the operating system owns these keys.')}`;
      nativeDisclosure.open = Boolean(query || contextFilter !== 'all');
      nativeDisclosure.append(summary, renderNativeRows(nativeEntries));
    }
    nativeDisclosure.hidden = !nativeEntries.length;

    const totalResults = records.length + nativeEntries.length;
    resultsStatus.textContent = `${text('Search results')}: ${totalResults}`;
    if (totalResults === 0) {
      const empty = createElement(document, 'p');
      empty.textContent = text('No matching actions.');
      results.append(empty);
    }

    const hasErrors = derived.validation.errors.length > 0;
    const hasWarnings = derived.validation.warnings.length > 0;
    validationStatus.textContent = hasErrors
      ? text('Fix invalid rows before applying.')
      : hasWarnings
        ? text('Prefix conflicts detected; Apply is allowed.')
        : derived.dirty
          ? text('Unsaved changes')
          : '';
    validationStatus.style.color = hasErrors ? THEME_VARS.error : THEME_VARS.warning;
    apply.disabled = !derived.dirty || !derived.validation.valid || !derived.effectiveMap;
    const saveState = state.saveOutcome;
    saveStatus.className = `zv-shortcut-save-${saveState ?? 'clean'}`;
    saveStatus.style.color = saveState === 'save-failed' ? THEME_VARS.error : THEME_VARS.success;
    saveStatus.textContent =
      saveState === 'saved'
        ? text('Saved.')
        : saveState === 'save-failed'
          ? text('Could not save bindings.')
          : statusMessage;
    if (restoreFocus) {
      const card = focusKey
        ? results.querySelector(`details[data-action-key="${focusKey}"]`)
        : null;
      const summary = card?.querySelector('summary') as HTMLElement | null;
      (summary ?? (apply.disabled ? search : apply)).focus();
    }
  }

  function finishRecording(): void {
    const active = recording;
    if (!active || !active.tokens.length) return;
    const sequence = serializeBindingTokens(active.tokens);
    if (!sequence) return;
    stopKeyCapture();
    recording = null;
    state =
      active.rowId === null
        ? addActionBinding(state, active.context, active.action, sequence)
        : transition(state, { type: 'update-row', rowId: active.rowId, patch: { key: sequence } });
    statusMessage = '';
    renderResults();
  }

  function save(): void {
    const derived = deriveBindingEditor(state);
    if (!derived.dirty || !derived.validation.valid || !derived.effectiveMap) return;
    try {
      if (options.onSave?.(derived.effectiveMap) === false) {
        state = transition(state, { type: 'save-failure' });
      } else {
        state = transition(state, { type: 'save-success', bindings: derived.effectiveMap });
      }
    } catch {
      state = transition(state, { type: 'save-failure' });
    }
    statusMessage = '';
    renderResults();
  }

  function handleClick(event: MouseEvent): void {
    const target = elementFromTarget(event.target);
    const button = target?.closest('button[data-shortcut-operation]') as HTMLButtonElement | null;
    if (!button) return;
    event.preventDefault();
    const operation = button.getAttribute('data-shortcut-operation');
    if (operation === 'finish-recording') {
      finishRecording();
      return;
    }
    if (operation === 'cancel-recording') {
      cancelRecording(true);
      renderResults();
      return;
    }
    if (recording) cancelRecording(false);
    if (operation === 'apply') {
      save();
      return;
    }
    const rowAttribute = button.getAttribute('data-shortcut-row');
    if (operation === 'remove-invalid-row' && rowAttribute !== null) {
      state = transition(state, { type: 'delete-row', rowId: Number(rowAttribute) });
      statusMessage = '';
      renderResults();
      return;
    }
    const context = button.getAttribute('data-shortcut-context');
    const action = button.getAttribute('data-shortcut-action');
    if (
      !context ||
      !(BINDING_CONTEXTS as readonly string[]).includes(context) ||
      !action ||
      !isActionId(action)
    )
      return;
    const typedContext = context as BindingContext;
    if (operation === 'record') {
      beginRecording(typedContext, action, rowAttribute === null ? null : Number(rowAttribute));
      return;
    }
    if (operation === 'add') {
      beginRecording(typedContext, action, null);
      return;
    }
    if (operation === 'unbind') {
      state = unbindAction(state, typedContext, action);
    } else if (operation === 'reset') {
      state = resetAction(state, typedContext, action);
    } else if (operation === 'remove-row' && rowAttribute !== null) {
      state = transition(state, { type: 'delete-row', rowId: Number(rowAttribute) });
    } else {
      return;
    }
    statusMessage = '';
    renderResults();
  }

  function handleInput(event: Event): void {
    const target = elementFromTarget(event.target);
    if (target !== search) return;
    if (recording) cancelRecording(true);
    renderResults();
  }

  function handleChange(event: Event): void {
    const target = elementFromTarget(event.target);
    if (recording) cancelRecording(true);
    if (
      target === contextSelect &&
      (contextSelect.value === 'all' ||
        (BINDING_CONTEXTS as readonly string[]).includes(contextSelect.value))
    ) {
      contextFilter = contextSelect.value as ContextFilter;
    } else if (
      target === groupSelect &&
      (groupSelect.value === 'all' ||
        (ACTION_GROUPS as readonly string[]).includes(groupSelect.value))
    ) {
      groupFilter = groupSelect.value as GroupFilter;
    } else if (
      target === availability &&
      (availability.value === 'all' ||
        availability.value === 'bound' ||
        availability.value === 'unbound')
    ) {
      availabilityFilter = availability.value;
    }
    renderResults();
  }

  const onClick: EventListener = (event) => handleClick(event as MouseEvent);
  const onInput: EventListener = (event) => handleInput(event);
  const onChange: EventListener = (event) => handleChange(event);
  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  root.addEventListener('change', onChange);
  apply.setAttribute('data-shortcut-operation', 'apply');

  renderResults();

  return {
    dispose: () => {
      if (disposed) return;
      disposed = true;
      cancelRecording(false);
      root.removeEventListener('click', onClick);
      root.removeEventListener('input', onInput);
      root.removeEventListener('change', onChange);
      root.replaceChildren();
    },
  };
}
