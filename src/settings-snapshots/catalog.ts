import {
  SettingsSnapshotError,
  type SettingsAdapter,
  type SettingsOperationContext,
} from './contracts';
import type {
  SettingsTemplateCatalogPort,
  SnapshotCaptureAdapter,
  SnapshotPluginTemplate,
  SnapshotTemplateField,
} from './ports';
import { assertSettingsCurrent, assertSettingsTextSize } from './document';
import { createSettingsAdapters } from './registry';
import { NATIVE_PREFERENCE_FIELDS } from './templates/zotero';
import { NEO_PREFERENCE_FIELDS } from './templates/zotero-neo';
import { discoverPluginTemplates } from './templates/scanner';
import { ReviewedPreferenceAdapter } from './adapters/preferences';
import { MAX_TEMPLATE_BYTES, settingsTemplateHost } from '../platform/settings-snapshot-templates';
import { ZOTERO_NEO_PLUGIN_ID } from '../modules/extensions/host';

interface TemplateFile {
  readonly format: 'zotero-neo-settings-template';
  readonly schemaVersion: 1;
  readonly pluginID: string;
  readonly version: string;
  readonly revision: string;
  readonly fields: readonly {
    readonly key: string;
    readonly type: SnapshotTemplateField['type'];
    readonly secret: boolean;
  }[];
  readonly status: 'draft' | 'reviewed' | 'needs-review';
}
/** Sticky field keys are profile-local metadata, independent of portable selection. */
interface TemplateRecord extends TemplateFile {
  readonly sensitiveKeys: readonly string[];
}
function invalid(): never {
  throw new SettingsSnapshotError(
    'invalid-template',
    'Template data is malformed, unsupported, or not locally owned',
  );
}
function parse(text: string, local = false): TemplateRecord {
  assertSettingsTextSize(text, MAX_TEMPLATE_BYTES);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    invalid();
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const data = value as Record<string, unknown>;
  if (
    Object.keys(data).some(
      (key) =>
        ![
          'format',
          'schemaVersion',
          'pluginID',
          'version',
          'revision',
          'fields',
          'status',
          ...(local ? ['sensitiveKeys'] : []),
        ].includes(key),
    ) ||
    data.format !== 'zotero-neo-settings-template' ||
    data.schemaVersion !== 1 ||
    typeof data.pluginID !== 'string' ||
    !data.pluginID ||
    data.pluginID.length > 512 ||
    /[\s\0]/u.test(data.pluginID) ||
    typeof data.version !== 'string' ||
    !data.version ||
    data.version.length > 128 ||
    typeof data.revision !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(data.revision) ||
    !Array.isArray(data.fields) ||
    data.fields.length > 2048 ||
    !['draft', 'reviewed', 'needs-review'].includes(String(data.status))
  )
    invalid();
  const keys = new Set<string>();
  const fields: TemplateFile['fields'][number][] = [];
  for (const field of data.fields) {
    if (!field || typeof field !== 'object' || Array.isArray(field)) invalid();
    const item = field as Record<string, unknown>;
    if (
      Object.keys(item).some((key) => !['key', 'type', 'secret'].includes(key)) ||
      typeof item.key !== 'string' ||
      !item.key ||
      item.key.length > 512 ||
      keys.has(item.key) ||
      !['boolean', 'number', 'string'].includes(String(item.type)) ||
      typeof item.secret !== 'boolean'
    )
      invalid();
    keys.add(item.key);
    fields.push({
      key: item.key,
      type: item.type as SnapshotTemplateField['type'],
      secret: item.secret,
    });
  }
  // Legacy v1 files have no private key list; their secret fields seed the same sticky policy.
  // The complete record remains bounded by MAX_TEMPLATE_BYTES and contains no preference values.
  const sensitiveKeys = new Set(fields.filter((field) => field.secret).map((field) => field.key));
  if (local && data.sensitiveKeys !== undefined) {
    if (!Array.isArray(data.sensitiveKeys)) invalid();
    const seen = new Set<string>();
    for (const key of data.sensitiveKeys) {
      if (typeof key !== 'string' || !key || key.length > 512 || seen.has(key)) invalid();
      seen.add(key);
      sensitiveKeys.add(key);
    }
  }
  return {
    format: 'zotero-neo-settings-template',
    schemaVersion: 1,
    pluginID: data.pluginID,
    version: data.version,
    revision: data.revision,
    fields,
    status: data.status as TemplateFile['status'],
    sensitiveKeys: [...sensitiveKeys],
  };
}
function mergeSensitiveKeys(
  record: TemplateRecord | undefined,
  fields: readonly {
    readonly key: string;
    readonly secret: boolean;
    readonly supported?: boolean;
  }[],
  knownKeys?: ReadonlySet<string>,
): readonly string[] {
  const keys = new Set(record?.sensitiveKeys);
  for (const field of fields)
    if (field.secret || (field.supported && knownKeys?.has(field.key))) keys.add(field.key);
  return record && keys.size === record.sensitiveKeys.length ? record.sensitiveKeys : [...keys];
}
function frozen(template: SnapshotPluginTemplate): SnapshotPluginTemplate {
  return Object.freeze({
    ...template,
    fields: Object.freeze(template.fields.map((field) => Object.freeze({ ...field }))),
    reviewedKeys: Object.freeze([...template.reviewedKeys]),
    issues: Object.freeze([...template.issues]),
  });
}
/** Construction is host-free; local templates hydrate only after an initialized caller lists/scans. */
export function createSettingsTemplateCatalog(
  neoVersion: () => string,
): SettingsTemplateCatalogPort {
  const builtins = createSettingsAdapters(neoVersion);
  const records = new Map<string, TemplateRecord>();
  const templates = new Map<string, SnapshotPluginTemplate>();
  const adapters = new Map<string, SettingsAdapter>();
  const scans = new Map<string, { revision: string; keys: ReadonlySet<string> }>();
  let disposed = false,
    loaded = false,
    stopObserving: (() => void) | undefined;
  let pluginGeneration = 0;
  let tail: Promise<unknown> = Promise.resolve();
  const assert = (context: SettingsOperationContext): void => {
    assertSettingsCurrent(context);
    if (disposed) throw new SettingsSnapshotError('cancelled', 'The template catalog is disposed');
  };
  const fileName = (id: string): string => `plugin-${settingsTemplateHost.digest(id)}.json`;
  const save = async (record: TemplateRecord, context: SettingsOperationContext): Promise<void> => {
    assert(context);
    await settingsTemplateHost.writeFile(
      fileName(record.pluginID),
      JSON.stringify(record, null, 2),
      {
        ...context,
        isCurrent: () => !disposed && context.isCurrent(),
      },
    );
    assert(context);
    records.set(record.pluginID, record);
  };
  const refresh = async (context: SettingsOperationContext): Promise<void> => {
    assert(context);
    if (!loaded) {
      const files = await settingsTemplateHost.readFiles();
      assert(context);
      const hydrated = new Map<string, TemplateRecord>();
      for (const file of files) {
        const record = parse(file.text, true);
        if (file.name !== fileName(record.pluginID) || hydrated.has(record.pluginID)) invalid();
        hydrated.set(record.pluginID, record);
      }
      for (const [id, record] of hydrated) records.set(id, record);
      loaded = true;
      stopObserving = settingsTemplateHost.observePlugins(() => {
        pluginGeneration++;
        scans.clear();
        adapters.clear();
        for (const [id, record] of records)
          if (record.status === 'reviewed' && record.fields.length)
            records.set(id, { ...record, status: 'needs-review' });
      });
    }
    const plugins = await settingsTemplateHost.plugins();
    assert(context);
    const discovered = discoverPluginTemplates(plugins, settingsTemplateHost).filter(
      (template) =>
        template.pluginID !== ZOTERO_NEO_PLUGIN_ID &&
        !builtins.some((adapter) => adapter.id === template.pluginID),
    );
    // Zotero stores values by preference key, not by plugin ID. Local sensitivity still
    // applies if a different installed plugin later becomes the sole owner of that key.
    const knownSensitiveKeys = new Set<string>();
    for (const record of records.values())
      for (const key of record.sensitiveKeys) knownSensitiveKeys.add(key);
    for (const draft of discovered)
      for (const field of draft.fields) if (field.secret) knownSensitiveKeys.add(field.key);
    templates.clear();
    const present = new Set<string>();
    for (const draft of discovered) {
      present.add(draft.pluginID);
      let record = records.get(draft.pluginID);
      const scan = scans.get(draft.pluginID);
      const verified = scan?.revision === draft.revision ? scan.keys : undefined;
      const previouslySelected =
        record?.status === 'reviewed' &&
        record.version === draft.version &&
        record.revision === draft.revision
          ? new Set(record.fields.map((field) => field.key))
          : undefined;
      const fields = draft.fields.map((field) =>
        field.requiresLiveBinding && !(verified ?? previouslySelected)?.has(field.key)
          ? {
              ...field,
              supported: false,
              reason: 'Scan the loaded Zotero settings pane to confirm this preference binding',
            }
          : field,
      );
      const sensitiveKeys = mergeSensitiveKeys(record, draft.fields, knownSensitiveKeys);
      if (sensitiveKeys.length && sensitiveKeys !== record?.sensitiveKeys) {
        adapters.delete(draft.pluginID);
        record = {
          ...(record ?? {
            format: 'zotero-neo-settings-template',
            schemaVersion: 1,
            pluginID: draft.pluginID,
            version: draft.version,
            revision: draft.revision,
            fields: fields
              .filter((field) => field.supported)
              .map(({ key, type, secret }) => ({ key, type, secret })),
            status: 'draft',
          }),
          sensitiveKeys,
        };
        await save(record, context);
      }
      const compatible =
        !!record &&
        draft.status !== 'unavailable' &&
        record.version === draft.version &&
        record.revision === draft.revision &&
        record.fields.every((selected) =>
          fields.some(
            (field) =>
              field.key === selected.key && field.supported && field.type === selected.type,
          ),
        );
      if (record?.status === 'reviewed' && record.fields.length && !compatible) {
        record = { ...record, status: 'needs-review' };
        await save(record, context);
      }
      const reviewed = compatible && record?.status === 'reviewed' && record.fields.length > 0;
      const template = frozen({
        ...draft,
        status:
          draft.status === 'unavailable'
            ? 'unavailable'
            : reviewed
              ? 'reviewed'
              : record?.status === 'needs-review' && record.fields.length
                ? 'needs-review'
                : 'draft',
        fields: fields.map((field) => ({
          ...field,
          secret: field.secret || !!record?.sensitiveKeys.includes(field.key),
        })),
        reviewedKeys: reviewed ? record!.fields.map((field) => field.key) : [],
      });
      templates.set(template.pluginID, template);
      if (!reviewed) {
        adapters.delete(template.pluginID);
        continue;
      }
      if (!adapters.has(template.pluginID)) {
        let adapter: SettingsAdapter;
        const selection = record;
        const captureAdapter = Object.assign(
          new ReviewedPreferenceAdapter(
            template,
            settingsTemplateHost,
            (operation) =>
              serial(operation, async () => {
                await refresh(operation);
                if (
                  adapters.get(template.pluginID) !== adapter ||
                  records.get(template.pluginID) !== selection
                )
                  throw new SettingsSnapshotError(
                    'stale-template',
                    'Plugin settings have changed; choose the settings to back up again',
                  );
              }),
            () =>
              !disposed &&
              adapters.get(template.pluginID) === adapter &&
              records.get(template.pluginID) === selection,
          ),
          {
            snapshotSensitiveKeys: {
              addonId: template.pluginID,
              keys: template.fields
                .filter((field) => field.secret && template.reviewedKeys.includes(field.key))
                .map((field) => field.key),
            },
          } satisfies Pick<SnapshotCaptureAdapter, 'snapshotSensitiveKeys'>,
        );
        adapter = captureAdapter;
        adapters.set(template.pluginID, adapter);
      }
    }
    for (const [id, record] of records)
      if (!present.has(id)) {
        adapters.delete(id);
        templates.set(
          id,
          frozen({
            pluginID: id,
            adapterID: `plugin-${settingsTemplateHost.digest(id)}`,
            label: id,
            version: record.version,
            revision: record.revision,
            status: 'unavailable',
            fields: record.fields.map((field) => ({
              ...field,
              secret: field.secret || record.sensitiveKeys.includes(field.key),
              label: field.key,
              supported: false,
              reason: 'Plugin is not installed',
              requiresRestart: true,
              source: 'local-template',
            })),
            reviewedKeys: [],
            issues: ['The plugin is not installed; no adapter is admitted'],
          }),
        );
      }
    for (const id of adapters.keys()) if (!present.has(id)) adapters.delete(id);
    assert(context);
  };
  const requireTemplate = (id: string): SnapshotPluginTemplate => {
    const template = templates.get(id);
    if (!template || template.status === 'unavailable')
      throw new SettingsSnapshotError(
        'unavailable-plugin',
        'An installed compatible plugin is required',
      );
    return template;
  };
  const serial = <T>(context: SettingsOperationContext, task: () => Promise<T>): Promise<T> => {
    const result = tail.then(async () => {
      assert(context);
      return task();
    });
    tail = result.catch(() => {});
    return result;
  };
  const scanBindings = async (
    template: SnapshotPluginTemplate,
    context: SettingsOperationContext,
  ): Promise<void> => {
    const generation = pluginGeneration;
    const current = () =>
      !disposed &&
      !context.signal.aborted &&
      context.isCurrent() &&
      generation === pluginGeneration;
    const keys = await settingsTemplateHost.scanBindings(template.pluginID, current);
    assert(context);
    if (!current())
      throw new SettingsSnapshotError(
        'stale-template',
        'The installed plugin changed during scanning',
      );
    scans.set(template.pluginID, { revision: template.revision, keys });
    await refresh(context);
  };
  const builtinTemplates = (): SnapshotPluginTemplate[] =>
    builtins.map((adapter, index) =>
      frozen({
        pluginID: adapter.id,
        adapterID: adapter.id,
        label: adapter.label,
        version: adapter.sourceVersion,
        revision: 'builtin-v1',
        status: 'builtin',
        fields: (index === 0 ? NATIVE_PREFERENCE_FIELDS : NEO_PREFERENCE_FIELDS).map((field) => ({
          key: field.key,
          label: field.label,
          type: field.type ?? 'string',
          secret: !!field.secret,
          requiresRestart: !!field.restart,
          supported: !field.manual,
          ...(field.manual ? { reason: field.manual } : {}),
          source: 'builtin-verified',
        })),
        reviewedKeys: [],
        issues: [
          'Built-in verified adapter; native resources and credential fields use dedicated local policies',
        ],
      }),
    );
  return {
    get adapters() {
      return disposed ? [] : [...builtins, ...adapters.values()];
    },
    list(context) {
      return serial(context, async () => {
        await refresh(context);
        return [...builtinTemplates(), ...templates.values()];
      });
    },
    scan(pluginID, context) {
      return serial(context, async () => {
        await refresh(context);
        const template = requireTemplate(pluginID);
        if (template.fields.some((field) => field.requiresLiveBinding))
          await scanBindings(template, context);
        return requireTemplate(pluginID);
      });
    },
    review(pluginID, revision, fields, context) {
      return serial(context, async () => {
        await refresh(context);
        const template = requireTemplate(pluginID);
        if (template.revision !== revision)
          throw new SettingsSnapshotError(
            'stale-template',
            'Plugin settings have changed; choose the settings to back up again',
          );
        if (!Array.isArray(fields) || fields.length > 2048) invalid();
        const selected: TemplateFile['fields'][number][] = [];
        const sensitiveKeys = new Set(records.get(pluginID)?.sensitiveKeys);
        const seen = new Set<string>();
        for (const request of fields) {
          const field = template.fields.find((candidate) => candidate.key === request.key);
          if (
            !field?.supported ||
            seen.has(request.key) ||
            typeof request.secret !== 'boolean' ||
            (request.portable !== undefined && typeof request.portable !== 'boolean')
          )
            invalid();
          seen.add(request.key);
          const secret = field.secret || request.secret;
          if (secret) sensitiveKeys.add(field.key);
          if (request.portable !== false)
            selected.push({ key: field.key, type: field.type, secret });
        }
        adapters.delete(pluginID);
        await save(
          {
            format: 'zotero-neo-settings-template',
            schemaVersion: 1,
            pluginID,
            version: template.version,
            revision,
            fields: selected,
            status: selected.length ? 'reviewed' : 'draft',
            sensitiveKeys: [...sensitiveKeys],
          },
          context,
        );
        await refresh(context);
        return requireTemplate(pluginID);
      });
    },
    workspaceAdapter(pluginID, version, approved, context) {
      return serial(context, async () => {
        await refresh(context);
        let template = templates.get(pluginID);
        if (!template || template.status === 'unavailable' || template.version !== version) return;
        if (template.fields.some((field) => field.requiresLiveBinding && approved.has(field.key))) {
          await scanBindings(template, context);
          template = templates.get(pluginID);
          if (!template || template.status === 'unavailable' || template.version !== version)
            return;
        }
        const fields = template.fields
          .filter(
            (field) =>
              field.supported &&
              approved.has(field.key) &&
              (!field.secret || approved.get(field.key)),
          )
          .map((field) => (approved.get(field.key) ? { ...field, secret: true } : field));
        const keys = new Set(fields.map(({ key }) => key));
        if (!keys.size) return;
        const revision = template.revision;
        const generation = pluginGeneration;
        const liveBinding = fields.some((field) => field.requiresLiveBinding);
        const scan = scans.get(pluginID);
        let record = records.get(pluginID);
        const current = () => {
          const local = templates.get(pluginID);
          if (!local || local.status === 'unavailable') return false;
          return (
            !disposed &&
            generation === pluginGeneration &&
            records.get(pluginID) === record &&
            local.revision === revision &&
            (!liveBinding || scans.get(pluginID) === scan)
          );
        };
        const recheck = (operation: SettingsOperationContext) => {
          assert(operation);
          if (!current())
            throw new SettingsSnapshotError(
              'stale-template',
              'Plugin settings changed after workspace review',
            );
        };
        const adapter = new ReviewedPreferenceAdapter(
          { ...template, fields, reviewedKeys: [...keys] },
          settingsTemplateHost,
          (operation) =>
            serial(operation, async () => {
              await refresh(operation);
              recheck(operation);
            }),
          current,
        );
        const apply = adapter.apply.bind(adapter);
        return {
          keys,
          adapter: Object.assign(adapter, {
            async apply(
              changes: Parameters<SettingsAdapter['apply']>[0],
              operation: SettingsOperationContext,
            ) {
              const sensitiveKeys = new Set(record?.sensitiveKeys);
              const previousSize = sensitiveKeys.size;
              for (const { key } of changes)
                if (keys.has(key) && approved.get(key)) sensitiveKeys.add(key);
              if (sensitiveKeys.size !== previousSize) {
                // After source verification, remember stronger sensitivity without changing review authority.
                await serial(operation, async () => {
                  await refresh(operation);
                  recheck(operation);
                  const next: TemplateRecord = {
                    ...(record ?? {
                      format: 'zotero-neo-settings-template',
                      schemaVersion: 1,
                      pluginID,
                      version,
                      revision,
                      fields: [],
                      status: 'draft',
                    }),
                    sensitiveKeys: [...sensitiveKeys],
                  };
                  adapters.delete(pluginID);
                  await save(next, operation);
                  record = next;
                });
              }
              return apply(changes, operation);
            },
          }),
        };
      });
    },
    exportTemplate(pluginID, context) {
      return serial(context, async () => {
        await refresh(context);
        const template = requireTemplate(pluginID),
          record = records.get(pluginID);
        return JSON.stringify(
          {
            format: 'zotero-neo-settings-template',
            schemaVersion: 1,
            pluginID,
            version: template.version,
            revision: template.revision,
            fields: template.fields
              .filter(
                (field) =>
                  field.supported &&
                  (!record || record.fields.some((selected) => selected.key === field.key)),
              )
              .map(({ key, type, secret }) => ({ key, type, secret })),
            status: 'draft',
          },
          null,
          2,
        );
      });
    },
    importTemplate(text, context) {
      return serial(context, async () => {
        const incoming = parse(text);
        await refresh(context);
        const template = requireTemplate(incoming.pluginID);
        if (incoming.version !== template.version || incoming.revision !== template.revision)
          throw new SettingsSnapshotError(
            'stale-template',
            'Imported template does not match current installed plugin sources',
          );
        for (const selected of incoming.fields)
          if (
            !template.fields.some(
              (field) =>
                field.key === selected.key && field.supported && field.type === selected.type,
            )
          )
            invalid();
        adapters.delete(incoming.pluginID);
        await save(
          {
            ...incoming,
            sensitiveKeys: mergeSensitiveKeys(records.get(incoming.pluginID), incoming.fields),
            status: 'draft',
          },
          context,
        );
        await refresh(context);
        return requireTemplate(incoming.pluginID);
      });
    },
    dispose() {
      disposed = true;
      adapters.clear();
      templates.clear();
      scans.clear();
      records.clear();
      stopObserving?.();
    },
  };
}
