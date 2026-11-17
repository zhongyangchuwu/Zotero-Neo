import { CleanupFailure, type Cleanup } from '../../core/cleanup';
import type { MainWindow } from '../../core/contracts';
import type { ItemAttributeNativeHost, NativeItemAttribute } from './item-attributes-types';

type RowContext = {
  rowID: string;
  item: Zotero.Item;
  tabType: string;
  editable: boolean;
};
type RowOptions = {
  rowID: string;
  pluginID: string;
  label: { l10nID: string; text: string };
  position: 'end';
  multiline: false;
  editable: true;
  onGetData(context: RowContext): string;
  onItemChange(
    context: RowContext & {
      setEnabled(enabled: boolean): void;
      setEditable(editable: boolean): void;
    },
  ): void;
};
type ColumnOptions = {
  dataKey: string;
  label: string;
  pluginID: string;
  enabledTreeIDs: string[];
  dataProvider(item: Zotero.Item): string;
  renderCell(
    index: number,
    data: string | undefined,
    column: { className: string },
    isFirstColumn: boolean,
    doc: Document,
  ): HTMLElement;
};
type NativeAPI = {
  ItemTreeManager: {
    registerColumn(options: ColumnOptions): string | false;
    unregisterColumn(id: string): boolean;
  };
  ItemPaneManager: {
    registerInfoRow(options: RowOptions): string | false;
    unregisterInfoRow(id: string): boolean;
  };
};
type InfoBox = Element & {
  readonly item: Zotero.Item;
  readonly extraItems: readonly Zotero.Item[];
  readonly tabType: string;
  readonly editable: boolean;
};
type AttributeField = Element & { readonly value: string; readonly cancelled: boolean };
type AttributeWindow = MainWindow & {
  readonly ZoteroPane?: { getSelectedItems(): Zotero.Item[] };
};
type WindowLease = {
  readonly window: MainWindow;
  readonly document: Document;
  active: boolean;
  edit?: Edit;
  cleanup: Cleanup;
};
type Registration = {
  readonly definition: NativeItemAttribute;
  readonly generation: number;
  rowID?: string;
  columnID?: string;
};
type Edit = {
  readonly lease: WindowLease;
  readonly registration: Registration;
  readonly field: AttributeField;
  readonly box: InfoBox;
  readonly item: Zotero.Item;
  readonly expectedExtra: string;
  readonly initialValue: string;
  submitted: boolean;
};

let nextGeneration = 0;
const DECIMAL = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;

function digitLetters(digits: string): string {
  return digits.replace(/\d/g, (digit) => String.fromCharCode(digit.charCodeAt(0) + 50));
}

function reverseLetters(letters: string): string {
  return letters.replace(/[a-z]/g, (letter) => String.fromCharCode(219 - letter.charCodeAt(0)));
}

function exponentSortKey(exponent: bigint): string {
  if (exponent === 0n) return 'c';
  const digits = (exponent < 0n ? -exponent : exponent).toString();
  // Unary digit count makes arbitrary-size integer magnitudes prefix-free.
  const magnitude = `${'l'.repeat(digits.length)}a${digitLetters(digits)}`;
  return exponent < 0n ? `b${reverseLetters(magnitude)}` : `d${magnitude}`;
}

/**
 * Native custom-column data is string-collated, with numeric digit mode optional.
 * Order exact decimals by sign, leading-digit exponent, then significant digits.
 * The sortable prefix uses only letters; reversing it reverses negative magnitude.
 * A low mantissa terminator distinguishes 1.2 from 1.23 before the raw suffix.
 * Keep the original spelling after "|" for rendering, never reconstruct a double.
 */
function numericSortKey(value: string): string {
  if (!value) return '';
  const match = DECIMAL.exec(value.trim());
  if (!match) return `f|${value}`;
  const integer = match[2] ?? '';
  const coefficient = integer + (match[3] ?? match[4] ?? '');
  const first = coefficient.search(/[1-9]/);
  if (first === -1) return `c|${value}`;
  const exponent = BigInt(match[5] ?? '0') + BigInt(integer.length) - BigInt(first) - 1n;
  const significant = coefficient.slice(first).replace(/0+$/, '');
  const magnitude = `${exponentSortKey(exponent)}${digitLetters(significant)}a`;
  return `${match[1] === '-' ? `b${reverseLetters(magnitude)}` : `d${magnitude}`}|${value}`;
}

function stableID(id: string): string {
  // UTF-16 code units, fixed width: no punctuation normalization collisions in
  // Zotero's plugin-ID namespacing, even for externally supplied definition IDs.
  let encoded = '';
  for (let index = 0; index < id.length; index++) {
    encoded += id.charCodeAt(index).toString(16).padStart(4, '0');
  }
  return `neo-attribute-${encoded}`;
}

function ordinary(item: Zotero.Item): boolean {
  return item.isRegularItem() && !item.deleted;
}

function fieldFromEvent(event: Event): AttributeField | undefined {
  const target = event.target as Element | null;
  // editable-text dispatches its own synchronous focus/blur on the custom
  // element. Ignore the underlying input's separate native events.
  if (target?.localName !== 'editable-text' || !target.classList.contains('custom-row-value')) {
    return undefined;
  }
  return target as AttributeField;
}

function singleSelection(lease: WindowLease, item: Zotero.Item): boolean {
  const selected = (lease.window as AttributeWindow).ZoteroPane?.getSelectedItems();
  return Array.isArray(selected) && selected.length === 1 && selected[0] === item;
}

function normalizedExtraKey(key: string): string {
  return key
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

function nativeReservedKeys(): Set<string> {
  type Inventories = {
    ItemFields?: { getAll?(): unknown };
    CreatorTypes?: { getAll?(): unknown };
    Schema?: {
      CSL_TEXT_MAPPINGS?: unknown;
      CSL_DATE_MAPPINGS?: unknown;
      CSL_NAME_MAPPINGS?: unknown;
    };
  };
  const native = Zotero as unknown as Inventories;
  const unavailable = () => new Error('Zotero Extra key inventories are unavailable or unknown');
  const reserved = new Set<string>();
  for (const inventory of [native.ItemFields, native.CreatorTypes]) {
    if (typeof inventory?.getAll !== 'function') throw unavailable();
    const entries = inventory.getAll();
    if (!Array.isArray(entries) || !entries.length) throw unavailable();
    for (const entry of entries) {
      if (!entry || typeof entry.name !== 'string' || !entry.name.trim()) throw unavailable();
      reserved.add(normalizedExtraKey(entry.name));
    }
  }
  // Schema loads these canonical inventories from its bundled/global schema.
  // extractExtraFields uses these same three maps plus the native field/creator lists.
  for (const map of [
    native.Schema?.CSL_TEXT_MAPPINGS,
    native.Schema?.CSL_DATE_MAPPINGS,
    native.Schema?.CSL_NAME_MAPPINGS,
  ]) {
    if (!map || typeof map !== 'object' || Array.isArray(map)) throw unavailable();
    const keys = Object.keys(map);
    if (!keys.length) throw unavailable();
    for (const key of keys) {
      if (!key.trim()) throw unavailable();
      reserved.add(normalizedExtraKey(key));
    }
  }
  // Native CSL name extraction also recognizes mapping values (e.g. container-author).
  for (const name of Object.values(native.Schema!.CSL_NAME_MAPPINGS!)) {
    if (typeof name !== 'string' || !name.trim()) throw unavailable();
    reserved.add(normalizedExtraKey(name));
  }
  return reserved;
}

/** Reject keys that Zotero would interpret as bibliographic metadata in Extra. */
export function assertCustomExtraKey(key: string): void {
  if (!key.trim() || /[:\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(key)) {
    throw new Error('An attribute key must be a nonempty single-line Extra key');
  }
  const normalized = normalizedExtraKey(key);
  if (normalized === 'type' || normalized.startsWith('zvmarks')) {
    throw new Error('This Extra key is reserved by Zotero or Neo');
  }
  type Classifier = {
    extractExtraFields?(extra: string): {
      itemType: string | null;
      fields: { readonly size: number };
      creators: unknown[];
      extra: string;
    };
  };
  const internal = Zotero.Utilities?.Internal as unknown as Classifier | undefined;
  if (typeof internal?.extractExtraFields !== 'function') {
    throw new Error('Zotero Extra key classification is unavailable');
  }
  if (nativeReservedKeys().has(normalized)) {
    throw new Error('Native bibliographic, CSL and creator Extra keys cannot be custom attributes');
  }
  const probe = `${key.trim()}: x`;
  const result = internal.extractExtraFields(probe);
  if (
    !result ||
    typeof result.extra !== 'string' ||
    !Number.isInteger(result.fields?.size) ||
    !Array.isArray(result.creators) ||
    !(result.itemType === null || typeof result.itemType === 'string')
  ) {
    throw new Error('Zotero returned an unknown Extra key classification');
  }
  if (
    result.itemType !== null ||
    result.fields.size ||
    result.creators.length ||
    result.extra !== probe
  ) {
    throw new Error('Native bibliographic, CSL and creator Extra keys cannot be custom attributes');
  }
}

/** One application-owned registration set; window leases only bind edit context. */
export function createItemAttributeNativeHost(
  pluginID: string,
  onError: (error: unknown, window?: MainWindow) => void,
): ItemAttributeNativeHost {
  const api = Zotero as unknown as NativeAPI;
  if (
    typeof api.ItemTreeManager?.registerColumn !== 'function' ||
    typeof api.ItemTreeManager?.unregisterColumn !== 'function' ||
    typeof api.ItemPaneManager?.registerInfoRow !== 'function' ||
    typeof api.ItemPaneManager?.unregisterInfoRow !== 'function'
  ) {
    throw new Error('Zotero custom item columns and Info rows are unavailable');
  }
  let disposed = false;
  let generation = 0;
  let registrations: Registration[] = [];
  const rows = new Map<string, Registration>();
  const windows = new Map<MainWindow, WindowLease>();

  const current = (registration: Registration) =>
    !disposed && registration.generation === generation;
  const retireEdits = () => {
    for (const lease of windows.values()) lease.edit = undefined;
  };
  const editable = (registration: Registration, item: Zotero.Item) =>
    current(registration) && ordinary(item) && registration.definition.canEdit(item);
  const editCurrent = (edit: Edit): boolean => {
    const { lease, field, box, item, registration } = edit;
    return (
      lease.active &&
      // Blur submits before the next field receives focus; that focus must not cancel this save.
      (edit.submitted || lease.edit === edit) &&
      !lease.window.closed &&
      lease.window.document === lease.document &&
      field.ownerDocument === lease.document &&
      field.isConnected &&
      field.closest('info-box') === box &&
      field.closest('.meta-row')?.getAttribute('data-custom-row-id') === registration.rowID &&
      box.item === item &&
      box.tabType === 'library' &&
      box.editable === true &&
      Array.isArray(box.extraItems) &&
      box.extraItems.length === 0 &&
      !field.hasAttribute('readonly') &&
      singleSelection(lease, item) &&
      editable(registration, item)
    );
  };
  const releaseRegistrations = () => {
    rows.clear();
    const failure = new CleanupFailure();
    for (const registration of registrations) {
      failure.run(() => {
        const id = registration.rowID;
        if (!id) return;
        // A false result means the ID is already absent, not a release failure.
        api.ItemPaneManager.unregisterInfoRow(id);
        delete registration.rowID;
      });
      failure.run(() => {
        const id = registration.columnID;
        if (!id) return;
        api.ItemTreeManager.unregisterColumn(id);
        delete registration.columnID;
      });
    }
    // Failed IDs remain owned and retired, so a later explicit cleanup can retry.
    registrations = registrations.filter(
      (registration) => registration.rowID || registration.columnID,
    );
    failure.rethrow();
  };
  const commitEdit = (
    lease: WindowLease,
    field: AttributeField,
    registration: Registration,
  ): void => {
    const edit = lease.edit;
    // A readonly field can still receive focus/blur without an admitted edit.
    if (!edit) return;
    try {
      if (edit.registration !== registration || edit.field !== field || !editCurrent(edit)) {
        throw new Error('Native attribute edit is stale, read-only, or multi-selected');
      }
      if (edit.submitted || field.cancelled) return;
      edit.submitted = true;
      const value = field.value;
      if (value === edit.initialValue) return;
      void registration.definition
        .write(edit.item, value, edit.expectedExtra, () => editCurrent(edit))
        .catch((error: unknown) => onError(error, lease.window));
    } catch (error) {
      onError(error, lease.window);
    }
  };

  return {
    replace(definitions) {
      if (disposed) throw new Error('Native attribute host is disposed');
      // Retire first: unregistering can synchronously cause native blur/render.
      generation = ++nextGeneration;
      retireEdits();
      releaseRegistrations();
      try {
        const ids = new Set<string>();
        for (const source of definitions) {
          if (!source.id || ids.has(source.id)) throw new Error('Duplicate or empty attribute ID');
          ids.add(source.id);
          const definition: NativeItemAttribute = {
            id: source.id,
            label: source.label,
            type: source.type,
            read: source.read.bind(source),
            canEdit: source.canEdit.bind(source),
            write: source.write.bind(source),
          };
          const registration: Registration = { definition, generation };
          registrations.push(registration);
          const columnID = api.ItemTreeManager.registerColumn({
            pluginID,
            dataKey: stableID(definition.id),
            label: definition.label,
            enabledTreeIDs: ['main'],
            dataProvider(item) {
              if (!current(registration) || !ordinary(item)) return '';
              try {
                const value = definition.read(item);
                return definition.type === 'number' ? numericSortKey(value) : value;
              } catch (error) {
                onError(error);
                return '';
              }
            },
            renderCell(_index, data, column, _isFirstColumn, doc) {
              const cell = doc.createElement('span');
              cell.className = `cell ${column.className}`;
              const value = data ?? '';
              cell.textContent = current(registration)
                ? definition.type === 'number'
                  ? value.slice(value.indexOf('|') + 1)
                  : value
                : '';
              return cell;
            },
          });
          if (!columnID)
            throw new Error(`Could not register native attribute column ${definition.label}`);
          registration.columnID = columnID;
          const rowID = api.ItemPaneManager.registerInfoRow({
            pluginID,
            rowID: `${stableID(definition.id)}-g${generation}`,
            // Native itemBox supports literal text; the public label type only
            // documents l10nID. A new row ID avoids cached labels on renames.
            label: { l10nID: '', text: definition.label },
            position: 'end',
            multiline: false,
            editable: true,
            onGetData(context) {
              if (
                !current(registration) ||
                context.tabType !== 'library' ||
                !ordinary(context.item)
              )
                return '';
              try {
                return definition.read(context.item);
              } catch (error) {
                onError(error);
                return '';
              }
            },
            onItemChange(context) {
              const enabled =
                current(registration) && context.tabType === 'library' && ordinary(context.item);
              context.setEnabled(enabled);
              context.setEditable(
                enabled && context.editable && editable(registration, context.item),
              );
            },
          });
          if (!rowID)
            throw new Error(`Could not register native attribute Info row ${definition.label}`);
          registration.rowID = rowID;
          rows.set(rowID, registration);
        }
      } catch (error) {
        generation = ++nextGeneration;
        retireEdits();
        const failure = new CleanupFailure();
        failure.run(() => {
          throw error;
        });
        failure.run(releaseRegistrations);
        failure.rethrow();
      }
    },
    attachWindow(window) {
      if (disposed) throw new Error('Native attribute host is disposed');
      // Reattachment replaces the lease, not global registrations. Old cleanup
      // functions cannot detach the replacement lease.
      windows.get(window)?.cleanup();
      const document = window.document;
      const lease: WindowLease = { window, document, active: true, cleanup: () => {} };
      const focus = (event: Event) => {
        const field = fieldFromEvent(event);
        if (!field || field.ownerDocument !== document) return;
        lease.edit = undefined;
        const rowID = field.closest('.meta-row')?.getAttribute('data-custom-row-id');
        const registration = rowID ? rows.get(rowID) : undefined;
        const box = field.closest('info-box') as InfoBox | null;
        if (!registration || !box) return;
        try {
          const edit: Edit = {
            lease,
            registration,
            field,
            box,
            item: box.item,
            expectedExtra: String(box.item.getField('extra')),
            initialValue: field.value,
            submitted: false,
          };
          lease.edit = edit;
          if (!editCurrent(edit)) lease.edit = undefined;
        } catch (error) {
          lease.edit = undefined;
          onError(error, window);
        }
      };
      const blur = (event: Event) => {
        const field = fieldFromEvent(event);
        if (!field || field.ownerDocument !== document) return;
        const rowID = field.closest('.meta-row')?.getAttribute('data-custom-row-id');
        const registration = rowID ? rows.get(rowID) : undefined;
        if (!registration) return;
        // Native rows created in a readonly pane lack their own focus/blur
        // listeners even after becoming editable. Own the captured blur instead
        // of relying on the ownerless native onSetData callback.
        commitEdit(lease, field, registration);
      };
      lease.cleanup = () => {
        if (!lease.active) return;
        lease.active = false;
        lease.edit = undefined;
        if (windows.get(window) === lease) windows.delete(window);
        document.removeEventListener('focus', focus, true);
        document.removeEventListener('blur', blur, true);
        window.removeEventListener('unload', lease.cleanup);
      };
      windows.set(window, lease);
      document.addEventListener('focus', focus, true);
      document.addEventListener('blur', blur, true);
      window.addEventListener('unload', lease.cleanup);
      return lease.cleanup;
    },
    dispose() {
      disposed = true;
      retireEdits();
      const failure = new CleanupFailure();
      for (const lease of windows.values()) failure.run(lease.cleanup);
      failure.run(releaseRegistrations);
      failure.rethrow();
    },
  };
}
