import type { Cleanup } from '../../core/cleanup';
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
  onSetData(context: RowContext & { value: string }): void;
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
    data: string,
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
type CommitContext = {
  readonly event: Event;
  readonly lease: WindowLease;
  readonly field: AttributeField;
  readonly rowID: string;
  readonly edit: Edit | undefined;
};

let nextGeneration = 0;
const SIGN_BIT = 1n << 63n;
const UINT64_MASK = (1n << 64n) - 1n;
const numberBits = new DataView(new ArrayBuffer(8));

/**
 * Zotero's custom-column comparator coerces data to strings before collation.
 * Encode finite doubles as fixed-width, unsigned decimal integers in IEEE order:
 * invert negative bits, flip the positive sign bit. Both ordinary and numeric
 * digit collation then compare magnitude correctly, including negatives and zero.
 * Only the renderer decodes these private sort keys; they are never item data.
 */
function numericSortKey(value: string): string {
  if (!value.trim()) return '';
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  numberBits.setFloat64(0, number === 0 ? 0 : number);
  const bits = numberBits.getBigUint64(0);
  const ordered = bits & SIGN_BIT ? UINT64_MASK ^ bits : bits ^ SIGN_BIT;
  return ordered.toString().padStart(20, '0');
}

function numericDisplay(key: string): string {
  if (!key) return '';
  const ordered = BigInt(key);
  const bits = ordered & SIGN_BIT ? ordered ^ SIGN_BIT : UINT64_MASK ^ ordered;
  numberBits.setBigUint64(0, bits);
  return String(numberBits.getFloat64(0));
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

/** Reject keys that Zotero would interpret as bibliographic metadata in Extra. */
export function assertCustomExtraKey(key: string): void {
  if (!key.trim() || /[:\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(key)) {
    throw new Error('An attribute key must be a nonempty single-line Extra key');
  }
  const normalized = key
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
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
  let committing: CommitContext | undefined;

  const current = (registration: Registration) =>
    !disposed && registration.generation === generation;
  const retireEdits = () => {
    committing = undefined;
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
    const retired = registrations;
    registrations = [];
    rows.clear();
    for (const registration of retired) {
      for (const [id, remove] of [
        [registration.rowID, (id: string) => api.ItemPaneManager.unregisterInfoRow(id)],
        [registration.columnID, (id: string) => api.ItemTreeManager.unregisterColumn(id)],
      ] as const) {
        if (!id) continue;
        try {
          if (!remove(id)) throw new Error(`Could not unregister native attribute ${id}`);
        } catch (error) {
          onError(error);
        }
      }
    }
  };
  const setData = (registration: Registration, context: RowContext & { value: string }) => {
    if (!current(registration)) return;
    const commit =
      committing?.event.eventPhase && committing.rowID === context.rowID ? committing : undefined;
    try {
      // The public callback has no document/owner/old value. Admit it only
      // during the exact editable-text blur dispatch captured in attachWindow.
      // Never infer an owner by scanning windows for the callback's item.
      if (
        !commit ||
        commit.event.eventPhase === 0 ||
        commit.rowID !== context.rowID ||
        !commit.edit ||
        commit.edit.registration !== registration ||
        commit.edit.item !== context.item ||
        commit.edit.field !== commit.field ||
        !context.editable ||
        context.tabType !== 'library' ||
        !editCurrent(commit.edit)
      ) {
        throw new Error(
          'Native attribute edit is stale, read-only, multi-selected, or has no exact owner',
        );
      }
      const edit = commit.edit;
      if (edit.submitted || commit.field.cancelled) return;
      edit.submitted = true;
      if (context.value === edit.initialValue) return;
      void registration.definition
        .write(edit.item, context.value, edit.expectedExtra, () => editCurrent(edit))
        .catch((error: unknown) => onError(error, edit.lease.window));
    } catch (error) {
      onError(error, commit?.lease.window);
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
              cell.textContent = current(registration)
                ? definition.type === 'number'
                  ? numericDisplay(data)
                  : data
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
            onSetData: (context) => setData(registration, context),
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
        releaseRegistrations();
        throw error;
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
        if (!rowID || !rows.has(rowID)) return;
        const context: CommitContext = { event, lease, field, rowID, edit: lease.edit };
        committing = context;
        // The native callback runs synchronously at the target. This only
        // releases references; eventPhase also rejects callbacks after dispatch.
        void Promise.resolve().then(() => {
          if (committing === context) committing = undefined;
        });
      };
      lease.cleanup = () => {
        if (!lease.active) return;
        lease.active = false;
        lease.edit = undefined;
        if (committing?.lease === lease) committing = undefined;
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
      if (disposed) return;
      disposed = true;
      retireEdits();
      for (const lease of windows.values()) lease.cleanup();
      releaseRegistrations();
    },
  };
}
