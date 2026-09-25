import { MODES, type BindingMap, type Mode } from '../input/bindings';
import {
  actionLabel,
  actionOptions,
  createBindingEditor,
  deriveBindingEditor,
  transition,
  type BindingEditorDerived,
  type BindingEditorEvent,
  type BindingEditorIssue,
  type BindingEditorLanguage,
  type BindingEditorRow,
  type BindingEditorState,
} from '../input/binding-editor';
import { isActionId } from '../input/actions';

const XHTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
const XUL_NAMESPACE = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';
const ROW_ATTRIBUTE = 'data-zv-binding-row-id';
const ACTIVE_ACTION_INPUT_CLASS = 'zv-binding-action-input';

type XulDocumentLike = {
  readonly createXULElement?: (localName: string) => Element;
};

interface XulMenuList extends Element {
  value?: string;
}

export interface BindingEditorHostAdapter {
  createXULElement(document: Document, localName: string): Element;
  setMenuValue?(menu: Element, value: string): void;
  getMenuValue?(menu: Element): string;
}

export interface BindingEditorGeometryAdapter {
  setScrollTop?(wrapper: HTMLElement, top: number): void;
  focusAndSelect?(input: HTMLInputElement): void;
  scrollIntoView?(element: Element): void;
}

export interface BindingEditorViewOptions {
  readonly document?: Document;
  readonly root?: Element;
  readonly baseline?: BindingMap;
  readonly language?: BindingEditorLanguage;
  readonly host?: Partial<BindingEditorHostAdapter>;
  readonly geometry?: BindingEditorGeometryAdapter;
  readonly onSave?: (bindings: BindingMap) => boolean | void;
  readonly localize?: (key: string, language: BindingEditorLanguage) => string;
  readonly onStateChange?: (state: BindingEditorState, derived: BindingEditorDerived) => void;
}

export interface MountedBindingEditor {
  readonly dispatch: (event: BindingEditorEvent) => void;
  readonly getState: () => BindingEditorState;
  readonly getDerived: () => BindingEditorDerived;
  readonly render: () => void;
  readonly dispose: () => void;
}

function createXhtmlElement<K extends keyof HTMLElementTagNameMap>(
  document: Document,
  localName: K,
): HTMLElementTagNameMap[K] {
  return document.createElementNS(XHTML_NAMESPACE, localName) as HTMLElementTagNameMap[K];
}

function defaultCreateXULElement(document: Document, localName: string): Element {
  const create = (document as unknown as XulDocumentLike).createXULElement;
  if (typeof create === 'function') return create.call(document, localName);
  return document.createElementNS(XUL_NAMESPACE, localName);
}

function setMenuValue(menu: Element, value: string): void {
  const xulMenu = menu as XulMenuList;
  xulMenu.value = value;
  menu.setAttribute('value', value);
}

function getMenuValue(menu: Element): string {
  const value = (menu as XulMenuList).value;
  return typeof value === 'string' && value ? value : (menu.getAttribute('value') ?? '');
}

function defaultSetScrollTop(wrapper: HTMLElement, top: number): void {
  wrapper.scrollTop = top;
}

function defaultFocusAndSelect(input: HTMLInputElement): void {
  input.focus();
  input.select();
}

function defaultScrollIntoView(element: Element): void {
  (
    element as Element & { scrollIntoView?: (options?: ScrollIntoViewOptions) => void }
  ).scrollIntoView?.({
    block: 'nearest',
  });
}

function elementFromTarget(target: EventTarget | null): Element | null {
  if (!target || typeof target !== 'object') return null;
  const node = target as Node;
  return node.nodeType === 1 ? (node as Element) : node.parentElement;
}

function ancestorWithClass(element: Element | null, className: string): Element | null {
  let current = element;
  while (current) {
    if (current.classList.contains(className)) return current;
    current = current.parentElement;
  }
  return null;
}

function rowIdFromElement(element: Element | null): number | null {
  let current = element;
  while (current) {
    const value = current.getAttribute(ROW_ATTRIBUTE);
    if (value !== null) {
      const rowId = Number.parseInt(value, 10);
      return Number.isFinite(rowId) ? rowId : null;
    }
    current = current.parentElement;
  }
  return null;
}

function issueText(
  issue: BindingEditorIssue,
  language: BindingEditorLanguage,
  localize: (key: string, language: BindingEditorLanguage) => string,
): string {
  const key =
    issue.kind === 'empty'
      ? 'zv.bindings.error.empty'
      : issue.kind === 'malformed'
        ? 'zv.bindings.error.malformed'
        : issue.kind === 'incompatible'
          ? 'zv.bindings.error.incompatible'
          : issue.kind === 'duplicate'
            ? 'zv.bindings.error.duplicate'
            : 'zv.bindings.warning.prefix';
  return localize(key, language);
}

function defaultLocalize(key: string): string {
  return key;
}

function actionDisplayValue(row: BindingEditorRow, state: BindingEditorState): string {
  if (state.actionEditor?.rowId === row.id && state.actionEditor.open) {
    return state.actionEditor.query;
  }
  return isActionId(row.action) ? actionLabel(row.action, state.language) : row.action;
}

export function mountBindingEditor(options: BindingEditorViewOptions): MountedBindingEditor {
  const resolvedDocument = options.document ?? options.root?.ownerDocument;
  if (!resolvedDocument) throw new Error('Binding editor requires a document');
  const document: Document = resolvedDocument;
  const root = options.root ?? document.documentElement;
  const host: BindingEditorHostAdapter = {
    createXULElement: options.host?.createXULElement ?? defaultCreateXULElement,
    setMenuValue: options.host?.setMenuValue ?? setMenuValue,
    getMenuValue: options.host?.getMenuValue ?? getMenuValue,
  };
  const geometry: Required<BindingEditorGeometryAdapter> = {
    setScrollTop: options.geometry?.setScrollTop ?? defaultSetScrollTop,
    focusAndSelect: options.geometry?.focusAndSelect ?? defaultFocusAndSelect,
    scrollIntoView: options.geometry?.scrollIntoView ?? defaultScrollIntoView,
  };
  const localize: (key: string, language: BindingEditorLanguage) => string =
    options.localize ?? ((key: string, _language: BindingEditorLanguage) => defaultLocalize(key));
  const baseline = options.baseline;
  let state = createBindingEditor(baseline, options.language ?? 'en');
  let disposed = false;
  let blurTimer: number | null = null;

  const tableBody = (): HTMLTableSectionElement | null =>
    root.querySelector('#zv-bindings-body') as HTMLTableSectionElement | null;
  const tableWrapper = (): HTMLElement | null =>
    root.querySelector('#zv-bindings-table-wrap') as HTMLElement | null;
  const activeInput = (): HTMLInputElement | null => {
    const editor = state.actionEditor;
    if (!editor) return null;
    return root.querySelector(
      `.${ACTIVE_ACTION_INPUT_CLASS}[${ROW_ATTRIBUTE}="${editor.rowId}"]`,
    ) as HTMLInputElement | null;
  };

  function renderModeControl(row: BindingEditorRow): Element {
    const menu = host.createXULElement(document, 'menulist');
    menu.classList.add('zv-binding-mode');
    menu.setAttribute('aria-label', localize('zv.bindings.mode', state.language));
    const popup = host.createXULElement(document, 'menupopup');
    for (const mode of MODES) {
      const item = host.createXULElement(document, 'menuitem');
      item.classList.add('zv-binding-mode-option');
      item.setAttribute('value', mode);
      item.setAttribute('label', mode);
      popup.appendChild(item);
    }
    menu.appendChild(popup);
    host.setMenuValue?.(menu, row.mode);
    return menu;
  }

  function renderActionResults(
    row: BindingEditorRow,
    actionInput: HTMLInputElement,
    actionResults: HTMLElement,
  ): void {
    const editor = state.actionEditor;
    const active = editor?.rowId === row.id && editor.open;
    actionResults.replaceChildren();
    actionResults.hidden = !active;
    actionInput.setAttribute('aria-expanded', active ? 'true' : 'false');
    actionInput.removeAttribute('aria-activedescendant');
    if (!active || !editor) return;

    const options = actionOptions(row.mode, editor.query, state.language);
    for (const [index, action] of options.entries()) {
      const result = createXhtmlElement(document, 'button');
      result.className = 'zv-binding-action-result';
      result.type = 'button';
      result.tabIndex = -1;
      result.setAttribute('role', 'option');
      result.id = `zv-binding-action-${row.id}-option-${index}`;
      result.setAttribute('value', action);
      result.value = action;
      result.setAttribute('title', action);
      result.setAttribute('aria-selected', index === editor.selectedIndex ? 'true' : 'false');
      result.textContent = actionLabel(action, state.language);
      actionResults.appendChild(result);
      if (index === editor.selectedIndex) {
        actionInput.setAttribute('aria-activedescendant', result.id);
        geometry.scrollIntoView(result);
      }
    }
  }

  function renderRow(row: BindingEditorRow, derived: BindingEditorDerived): HTMLTableRowElement {
    const tableRow = createXhtmlElement(document, 'tr');
    tableRow.setAttribute(ROW_ATTRIBUTE, String(row.id));
    if ((MODES as readonly string[]).includes(row.mode)) {
      tableRow.classList.add(`zv-binding-mode-${row.mode}`);
    }
    const issues = [
      ...derived.validation.errors.filter((issue) => issue.rowId === row.id),
      ...derived.validation.warnings.filter((issue) => issue.rowId === row.id),
    ];
    const hasError = derived.validation.errors.some((issue) => issue.rowId === row.id);
    const hasWarning = derived.validation.warnings.some((issue) => issue.rowId === row.id);
    if (hasError) tableRow.classList.add('zv-binding-row-error');
    else if (hasWarning) tableRow.classList.add('zv-binding-row-warning');
    if (issues.length) {
      tableRow.title = [
        ...new Set(issues.map((issue) => issueText(issue, state.language, localize))),
      ].join(' ');
      if (hasError) tableRow.setAttribute('aria-invalid', 'true');
    }

    const modeCell = createXhtmlElement(document, 'td');
    modeCell.className = 'zv-binding-mode-cell';
    modeCell.appendChild(renderModeControl(row));
    tableRow.appendChild(modeCell);

    const keyCell = createXhtmlElement(document, 'td');
    keyCell.className = 'zv-binding-key-cell';
    const keyInput = createXhtmlElement(document, 'input');
    keyInput.className = 'zv-binding-key';
    keyInput.type = 'text';
    keyInput.value = row.key.startsWith(' ') ? `<space>${row.key.slice(1)}` : row.key;
    keyInput.setAttribute('aria-label', localize('zv.bindings.key', state.language));
    keyInput.setAttribute(ROW_ATTRIBUTE, String(row.id));
    keyCell.appendChild(keyInput);
    tableRow.appendChild(keyCell);

    const actionCell = createXhtmlElement(document, 'td');
    actionCell.className = 'zv-binding-action-cell';
    const actionRoot = createXhtmlElement(document, 'div');
    actionRoot.className = 'zv-binding-action';
    const actionInput = createXhtmlElement(document, 'input');
    actionInput.className = ACTIVE_ACTION_INPUT_CLASS;
    actionInput.type = 'text';
    actionInput.setAttribute('role', 'combobox');
    actionInput.autocomplete = 'off';
    actionInput.setAttribute('aria-autocomplete', 'list');
    actionInput.setAttribute('aria-haspopup', 'listbox');
    actionInput.setAttribute('aria-label', localize('zv.bindings.action', state.language));
    actionInput.setAttribute(ROW_ATTRIBUTE, String(row.id));
    actionInput.id = `zv-binding-action-${row.id}`;
    actionInput.value = actionDisplayValue(row, state);
    const actionResults = createXhtmlElement(document, 'div');
    actionResults.className = 'zv-binding-action-results';
    actionResults.id = `${actionInput.id}-listbox`;
    actionResults.setAttribute('role', 'listbox');
    actionInput.setAttribute('aria-controls', actionResults.id);
    actionRoot.append(actionInput, actionResults);
    actionCell.appendChild(actionRoot);
    tableRow.appendChild(actionCell);

    const deleteCell = createXhtmlElement(document, 'td');
    deleteCell.className = 'zv-binding-delete-cell';
    const deleteButton = createXhtmlElement(document, 'button');
    deleteButton.className = 'zv-binding-delete';
    deleteButton.type = 'button';
    deleteButton.textContent = '×';
    deleteButton.setAttribute('aria-label', 'Delete binding');
    deleteCell.appendChild(deleteButton);
    tableRow.appendChild(deleteCell);

    renderActionResults(row, actionInput, actionResults);
    return tableRow;
  }
  function renderRowValidation(rowId: number, derived: BindingEditorDerived): void {
    const tableRow = root.querySelector(`tr[${ROW_ATTRIBUTE}="${rowId}"]`) as HTMLElement | null;
    if (!tableRow) return;
    const issues = [
      ...derived.validation.errors.filter((issue) => issue.rowId === rowId),
      ...derived.validation.warnings.filter((issue) => issue.rowId === rowId),
    ];
    const hasError = derived.validation.errors.some((issue) => issue.rowId === rowId);
    const hasWarning = derived.validation.warnings.some((issue) => issue.rowId === rowId);
    tableRow.classList.remove('zv-binding-row-error', 'zv-binding-row-warning');
    if (hasError) tableRow.classList.add('zv-binding-row-error');
    else if (hasWarning) tableRow.classList.add('zv-binding-row-warning');
    if (issues.length) {
      tableRow.title = [
        ...new Set(issues.map((issue) => issueText(issue, state.language, localize))),
      ].join(' ');
    } else {
      tableRow.title = '';
    }
    if (hasError) tableRow.setAttribute('aria-invalid', 'true');
    else tableRow.removeAttribute('aria-invalid');
  }

  function renderStatus(derived: BindingEditorDerived): void {
    const validationStatus = root.querySelector(
      '#zv-bindings-validation-status',
    ) as HTMLElement | null;
    const validationState = !derived.validation.valid
      ? 'invalid'
      : derived.validation.warnings.length
        ? 'warning'
        : derived.dirty
          ? 'dirty'
          : 'clean';
    if (validationStatus) {
      validationStatus.className = `zv-status zv-binding-status-${validationState}`;
      validationStatus.textContent =
        validationState === 'invalid'
          ? localize('zv.bindings.status.invalid', state.language)
          : validationState === 'warning'
            ? localize('zv.bindings.status.warning', state.language)
            : validationState === 'dirty'
              ? localize('zv.bindings.status.dirty', state.language)
              : '';
    }

    const saveStatus = root.querySelector('#zv-save-status') as HTMLElement | null;
    if (saveStatus) {
      const saveState = state.saveOutcome ?? validationState;
      saveStatus.className = `zv-status zv-binding-save-${saveState}`;
      saveStatus.textContent =
        state.saveOutcome === 'saved'
          ? localize('zv.status.saved', state.language)
          : state.saveOutcome === 'save-failed'
            ? localize('zv.status.saveFailed', state.language)
            : '';
    }
    const saveButton = root.querySelector('#zv-save') as HTMLButtonElement | null;
    if (saveButton) saveButton.disabled = !derived.dirty || !derived.validation.valid;
  }

  function notify(): void {
    options.onStateChange?.(state, deriveBindingEditor(state));
  }

  function renderActionProjection(rowId: number): void {
    const row = state.rows.find((candidate) => candidate.id === rowId);
    const input = root.querySelector(
      `.${ACTIVE_ACTION_INPUT_CLASS}[${ROW_ATTRIBUTE}="${rowId}"]`,
    ) as HTMLInputElement | null;
    const results = input?.parentElement?.querySelector(
      '.zv-binding-action-results',
    ) as HTMLElement | null;
    if (!row || !input || !results) {
      render();
      return;
    }
    input.value = actionDisplayValue(row, state);
    renderActionResults(row, input, results);
    const derived = deriveBindingEditor(state);
    renderRowValidation(rowId, derived);
    renderStatus(derived);
    notify();
  }

  function render(): void {
    if (disposed) return;
    const body = tableBody();
    if (body) {
      const derived = deriveBindingEditor(state);
      body.replaceChildren(...state.rows.map((row) => renderRow(row, derived)));
      renderStatus(derived);
    }
    notify();
  }

  function isActionEvent(event: BindingEditorEvent): boolean {
    return (
      event.type === 'open-action-editor' ||
      event.type === 'update-action-query' ||
      event.type === 'move-action-selection' ||
      event.type === 'select-action' ||
      event.type === 'commit-action-selection' ||
      event.type === 'close-action-editor'
    );
  }

  function dispatch(event: BindingEditorEvent): void {
    if (disposed) return;
    const focused = document.activeElement as HTMLInputElement | null;
    const focusedKind = focused?.classList.contains(ACTIVE_ACTION_INPUT_CLASS)
      ? 'action'
      : focused?.classList.contains('zv-binding-key')
        ? 'key'
        : null;
    const focusedRowId = focusedKind ? rowIdFromElement(focused) : null;
    const selectionStart = focused?.selectionStart;
    const selectionEnd = focused?.selectionEnd;
    const previous = state;
    state = transition(state, event);
    const eventRowId = 'rowId' in event ? event.rowId : previous.actionEditor?.rowId;
    if (isActionEvent(event) && eventRowId !== undefined) {
      const existing = root.querySelector(
        `.${ACTIVE_ACTION_INPUT_CLASS}[${ROW_ATTRIBUTE}="${eventRowId}"]`,
      );
      if (existing) renderActionProjection(eventRowId);
      else render();
    } else {
      render();
    }
    if (focusedRowId === null || focusedKind === null) return;
    if (focusedKind === 'action') {
      if (!state.actionEditor || state.actionEditor.rowId !== focusedRowId) return;
      const replacement = activeInput();
      if (!replacement) return;
      replacement.focus();
      if (selectionStart !== null && selectionStart !== undefined) {
        replacement.setSelectionRange(selectionStart, selectionEnd ?? selectionStart);
      }
      return;
    }
    const replacement = root.querySelector(
      `.zv-binding-key[${ROW_ATTRIBUTE}="${focusedRowId}"]`,
    ) as HTMLInputElement | null;
    if (!replacement) return;
    replacement.focus();
    if (selectionStart !== null && selectionStart !== undefined) {
      replacement.setSelectionRange(selectionStart, selectionEnd ?? selectionStart);
    }
  }

  function scheduleClose(rowId: number): void {
    const view = document.defaultView;
    if (blurTimer !== null) {
      if (view) view.clearTimeout(blurTimer);
      else globalThis.clearTimeout(blurTimer);
    }
    const close = () => {
      blurTimer = null;
      if (disposed || state.actionEditor?.rowId !== rowId) return;
      const input = activeInput();
      if (input && document.activeElement && input === document.activeElement) return;
      dispatch({ type: 'close-action-editor', rowId });
    };
    blurTimer = (view
      ? view.setTimeout(close, 0)
      : globalThis.setTimeout(close, 0)) as unknown as number;
  }

  function handleClick(event: MouseEvent): void {
    const target = elementFromTarget(event.target);
    if (!target) return;
    if (target.id === 'zv-add-binding' || target.closest('#zv-add-binding')) {
      event.preventDefault();
      dispatch({ type: 'add-row' });
      const wrapper = tableWrapper();
      const body = tableBody();
      const key = body?.querySelector('.zv-binding-key') as HTMLInputElement | null;
      if (wrapper) geometry.setScrollTop(wrapper, 0);
      if (key) geometry.focusAndSelect(key);
      return;
    }
    if (target.id === 'zv-reset-bindings' || target.closest('#zv-reset-bindings')) {
      event.preventDefault();
      dispatch({ type: 'reset' });
      return;
    }
    if (target.id === 'zv-save' || target.closest('#zv-save')) {
      event.preventDefault();
      const derived = deriveBindingEditor(state);
      if (!derived.dirty || !derived.validation.valid || !derived.effectiveMap) return;
      try {
        if (options.onSave?.(derived.effectiveMap) === false) {
          dispatch({ type: 'save-failure' });
        } else {
          dispatch({ type: 'save-success', bindings: derived.effectiveMap });
        }
      } catch {
        dispatch({ type: 'save-failure' });
      }
      return;
    }
    const actionResult = target.closest('.zv-binding-action-result') as HTMLButtonElement | null;
    if (actionResult) {
      const rowId = rowIdFromElement(actionResult);
      const action = actionResult.value || actionResult.getAttribute('value');
      if (rowId !== null && action && isActionId(action)) {
        event.preventDefault();
        dispatch({ type: 'select-action', rowId, action });
      }
      return;
    }
    const actionInput = target.closest(`.${ACTIVE_ACTION_INPUT_CLASS}`) as HTMLInputElement | null;
    if (actionInput) {
      const rowId = rowIdFromElement(actionInput);
      if (rowId !== null) dispatch({ type: 'open-action-editor', rowId });
    }
    const deleteButton = target.closest('.zv-binding-delete');
    if (deleteButton) {
      const rowId = rowIdFromElement(deleteButton);
      if (rowId !== null) {
        event.preventDefault();
        dispatch({ type: 'delete-row', rowId });
      }
    }
  }

  function handleInput(event: Event): void {
    const target = elementFromTarget(event.target);
    if (!target || !target.classList.contains(ACTIVE_ACTION_INPUT_CLASS)) return;
    const rowId = rowIdFromElement(target);
    if (rowId === null) return;
    dispatch({ type: 'update-action-query', rowId, query: (target as HTMLInputElement).value });
  }

  function handleKeyInput(event: Event): void {
    const target = elementFromTarget(event.target);
    if (!target || !target.classList.contains('zv-binding-key')) return;
    const rowId = rowIdFromElement(target);
    if (rowId === null) return;
    const input = target as HTMLInputElement;
    const value = input.value.startsWith('<space>')
      ? ` ${input.value.slice('<space>'.length)}`
      : input.value;
    dispatch({ type: 'update-row', rowId, patch: { key: value } });
  }

  function handleKeyDown(event: KeyboardEvent): void {
    const target = elementFromTarget(event.target);
    if (!target || !target.classList.contains(ACTIVE_ACTION_INPUT_CLASS)) return;
    const rowId = rowIdFromElement(target);
    if (rowId === null) return;
    if (event.key === 'Escape') {
      if (!state.actionEditor?.open) return;
      event.preventDefault();
      event.stopPropagation();
      dispatch({ type: 'close-action-editor', rowId });
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!state.actionEditor?.open) return;
      event.preventDefault();
      event.stopPropagation();
      dispatch({
        type: 'move-action-selection',
        rowId,
        delta: event.key === 'ArrowDown' ? 1 : -1,
      });
    } else if (event.key === 'Enter') {
      if (!state.actionEditor?.open) return;
      event.preventDefault();
      event.stopPropagation();
      dispatch({ type: 'commit-action-selection', rowId });
    } else if (event.key === 'Tab') {
      dispatch({ type: 'close-action-editor', rowId });
    }
  }

  function handleFocusIn(event: FocusEvent): void {
    const target = elementFromTarget(event.target);
    if (!target || !target.classList.contains(ACTIVE_ACTION_INPUT_CLASS)) return;
    const rowId = rowIdFromElement(target);
    if (rowId !== null) dispatch({ type: 'open-action-editor', rowId });
  }

  function handleFocusOut(event: FocusEvent): void {
    const target = elementFromTarget(event.target);
    if (!target || !target.classList.contains(ACTIVE_ACTION_INPUT_CLASS)) return;
    const rowId = rowIdFromElement(target);
    if (rowId !== null) scheduleClose(rowId);
  }

  function handleCommand(event: Event): void {
    const target = elementFromTarget(event.target);
    const modeMenu = ancestorWithClass(target, 'zv-binding-mode');
    if (!modeMenu) return;
    const rowId = rowIdFromElement(modeMenu);
    if (rowId === null) return;
    const selected =
      target?.localName === 'menuitem'
        ? (target.getAttribute('value') ?? '')
        : (host.getMenuValue?.(modeMenu) ?? '');
    if ((MODES as readonly string[]).includes(selected)) {
      event.preventDefault();
      dispatch({ type: 'update-row', rowId, patch: { mode: selected as Mode } });
    }
  }

  const onClick: EventListener = (event) => handleClick(event as MouseEvent);
  const onKeyDown: EventListener = (event) => handleKeyDown(event as KeyboardEvent);
  const onFocusIn: EventListener = (event) => handleFocusIn(event as FocusEvent);
  const onFocusOut: EventListener = (event) => handleFocusOut(event as FocusEvent);

  root.addEventListener('click', onClick);
  root.addEventListener('input', handleInput);
  root.addEventListener('input', handleKeyInput);
  root.addEventListener('keydown', onKeyDown);
  root.addEventListener('focusin', onFocusIn);
  root.addEventListener('focusout', onFocusOut);
  root.addEventListener('command', handleCommand, true);

  render();

  return {
    dispatch,
    getState: () => state,
    getDerived: () => deriveBindingEditor(state),
    render,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      root.removeEventListener('click', onClick);
      root.removeEventListener('input', handleInput);
      root.removeEventListener('input', handleKeyInput);
      root.removeEventListener('keydown', onKeyDown);
      root.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('focusout', onFocusOut);
      root.removeEventListener('command', handleCommand, true);
      if (blurTimer !== null) {
        if (document.defaultView) document.defaultView.clearTimeout(blurTimer);
        else globalThis.clearTimeout(blurTimer);
        blurTimer = null;
      }
    },
  };
}
