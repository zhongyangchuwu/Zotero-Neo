import type { SnapshotPluginTemplate, SnapshotTemplateField } from '../ports';
import type { MainTemplatePlugin } from '../../toolkit/main';

export interface TemplateDiscovery {
  preferenceType(key: string): SnapshotTemplateField['type'] | null;
  digest(text: string): string;
}
const MAX_FIELDS = 2048;
const KEY = /^extensions\.[A-Za-z0-9_@{}.-]{1,480}$/u;
const RESERVED = /^extensions\.zotero-neo(?:\.|$)/u;
const UNSAFE =
  /path|directory|datadir|file|script|code|css|html|template|command|executable|launcher/iu;
const SENSITIVE = /password|passwd|token|secret|credential|apikey|api[._-]key|authorization/iu;
/** Only complete literal statements count. Comments are skipped only outside strings. */
function declaredDefaults(
  plugin: MainTemplatePlugin,
): Map<string, SnapshotTemplateField['type'] | null> {
  const result = new Map<string, SnapshotTemplateField['type'] | null>();
  const string = String.raw`(?:"(?:[^"\\\r\n]|\\(?:['"\\/bfnrtv]|0(?!\d)|x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|\r?\n))*"|'(?:[^'\\\r\n]|\\(?:['"\\/bfnrtv]|0(?!\d)|x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|\r?\n))*')`;
  const number = String.raw`[+-]?(?:0[xX][0-9a-fA-F]+|0[bB][01]+|0[oO][0-7]+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)`;
  const literal = new RegExp(String.raw`true\b|false\b|${number}|${string}`, 'yu');
  const name = /(["'])([A-Za-z0-9_@{}.-]+)\1/uy;
  for (const source of plugin.defaults) {
    const declared = new Map<string, SnapshotTemplateField['type'] | null>();
    let offset = 0,
      staticOnly = source.text.length <= 512 * 1024;
    const skip = (): boolean => {
      while (offset < source.text.length) {
        if (/\s/u.test(source.text[offset]!)) offset++;
        else if (source.text.startsWith('//', offset)) {
          while (offset < source.text.length && !/[\r\n]/u.test(source.text[offset]!)) offset++;
        } else if (source.text.startsWith('/*', offset)) {
          const end = source.text.indexOf('*/', offset + 2);
          if (end < 0) return false;
          offset = end + 2;
        } else break;
      }
      return true;
    };
    const take = (token: string): boolean => {
      if (!skip() || !source.text.startsWith(token, offset)) return false;
      offset += token.length;
      return true;
    };
    while (staticOnly && offset < source.text.length) {
      if (!skip()) {
        staticOnly = false;
        break;
      }
      if (offset === source.text.length) break;
      if (!take('pref') || !take('(') || !skip()) {
        staticOnly = false;
        break;
      }
      name.lastIndex = offset;
      const key = name.exec(source.text)?.[2];
      if (!key) {
        staticOnly = false;
        break;
      }
      offset = name.lastIndex;
      if (!take(',') || !skip()) {
        staticOnly = false;
        break;
      }
      literal.lastIndex = offset;
      const value = literal.exec(source.text)?.[0];
      if (value === undefined) {
        staticOnly = false;
        break;
      }
      offset = literal.lastIndex;
      if (!skip()) {
        staticOnly = false;
        break;
      }
      if (source.text[offset] === ',') offset++;
      if (!take(')')) {
        staticOnly = false;
        break;
      }
      declared.set(
        key,
        declared.has(key)
          ? null
          : /^(true|false)$/u.test(value)
            ? 'boolean'
            : value.startsWith('"') || value.startsWith("'")
              ? 'string'
              : 'number',
      );
      const end = offset;
      if (!skip()) {
        staticOnly = false;
        break;
      }
      if (source.text[offset] === ';') offset++;
      else if (offset !== source.text.length && !/[\r\n]/u.test(source.text.slice(end, offset)))
        staticOnly = false;
    }
    if (staticOnly)
      for (const [key, type] of declared) result.set(key, result.has(key) ? null : type);
  }
  return result;
}
interface MarkupTag {
  readonly name: string;
  readonly attributes: ReadonlyMap<string, string>;
  readonly children: readonly MarkupTag[];
}
function tags(text: string): MarkupTag[] {
  if (text.length > 512 * 1024 || /<!DOCTYPE|<!ENTITY/iu.test(text))
    throw new Error('Unsafe markup');
  // Tokenize data only. No DOM, URL resolution, resource fetch, or script evaluation occurs here.
  const result: MarkupTag[] = [];
  let offset = 0;
  const stack: { name: string; children: MarkupTag[] }[] = [];
  while (offset < text.length) {
    const start = text.indexOf('<', offset);
    if (start < 0) break;
    if (text.startsWith('<!--', start)) {
      const end = text.indexOf('-->', start + 4);
      if (end < 0) throw new Error('Unterminated comment');
      offset = end + 3;
      continue;
    }
    let quote = '',
      end = start + 1;
    for (; end < text.length; end++) {
      const character = text[end]!;
      if (quote) {
        if (character === quote) quote = '';
      } else if (character === '"' || character === "'") quote = character;
      else if (character === '>') break;
    }
    if (end === text.length) throw new Error('Unterminated markup tag');
    const raw = text.slice(start, end + 1);
    offset = end + 1;
    if (/^<\?xml\b[\s\S]*\?>$/u.test(raw)) continue;
    const closing = /^<\/([A-Za-z][\w:.-]*)\s*>$/u.exec(raw);
    if (closing) {
      if (stack.pop()?.name !== closing[1]!.toLowerCase()) throw new Error('Mismatched markup tag');
      continue;
    }
    const match =
      /^<([A-Za-z][\w:.-]*)((?:\s+[A-Za-z_:][\w:.-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*\/?\s*>$/u.exec(
        raw,
      );
    if (!match) throw new Error('Unsupported markup syntax');
    const name = match[1]!.toLowerCase().split(':').at(-1)!;
    if (['script', 'style', 'template'].includes(name)) {
      // Keep inert children visible to constraint discovery without executing their content.
      stack.at(-1)?.children.push({ name, attributes: new Map(), children: [] });
      if (!/\/\s*>$/u.test(raw)) {
        const closing = new RegExp(`<\\/(?:[A-Za-z][\\w.-]*:)?${name}\\s*>`, 'giu');
        closing.lastIndex = offset;
        const close = closing.exec(text);
        if (!close) throw new Error('Unterminated inert content');
        offset = closing.lastIndex;
      }
      continue;
    }
    const attributes = new Map<string, string>();
    for (const attribute of match[2]!.matchAll(
      /([A-Za-z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/gu,
    )) {
      const attributeName = attribute[1]!.toLowerCase();
      if (attributes.has(attributeName)) throw new Error('Duplicate markup attribute');
      attributes.set(attributeName, attribute[2] ?? attribute[3] ?? '');
    }
    const children: MarkupTag[] = [];
    const element = { name, attributes, children };
    result.push(element);
    stack.at(-1)?.children.push(element);
    // Only unqualified HTML void tags omit their closer; namespaced XHTML inputs may close explicitly.
    if (
      !/\/\s*>$/u.test(raw) &&
      ![
        'area',
        'base',
        'br',
        'col',
        'embed',
        'hr',
        'img',
        'input',
        'link',
        'meta',
        'param',
        'source',
        'track',
        'wbr',
      ].includes(match[1]!.toLowerCase())
    )
      stack.push({ name: match[1]!.toLowerCase(), children });
    if (result.length > 20_000) throw new Error('Too many markup controls');
  }
  if (stack.length) throw new Error('Unclosed markup tag');
  return result;
}
type ControlConstraints = Pick<SnapshotTemplateField, 'minimum' | 'maximum' | 'values'>;
function constraints(
  element: MarkupTag,
  elements: readonly MarkupTag[],
  type: SnapshotTemplateField['type'],
): ControlConstraints {
  const attrs = element.attributes,
    inputType = (attrs.get('type') ?? 'text').toLowerCase();
  if (
    ['pattern', 'minlength', 'maxlength', 'required', 'multiple', 'list'].some((key) =>
      attrs.has(key),
    )
  )
    throw new Error('Unrepresentable control validation');
  const numeric = inputType === 'number' || (element.name === 'textbox' && type === 'number');
  const bounds: { minimum?: number; maximum?: number } = {};
  for (const [attribute, bound] of [
    ['min', 'minimum'],
    ['max', 'maximum'],
  ] as const) {
    const raw = attrs.get(attribute);
    if (raw === undefined) continue;
    if (
      !numeric ||
      type !== 'number' ||
      !/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu.test(raw) ||
      !Number.isFinite(Number(raw))
    )
      throw new Error('Invalid numeric bound');
    bounds[bound] = Number(raw);
  }
  if (
    Math.max(-2147483648, Math.ceil(bounds.minimum ?? -2147483648)) >
    Math.min(2147483647, Math.floor(bounds.maximum ?? 2147483647))
  )
    throw new Error('Empty numeric range');
  if (attrs.has('step') && (!numeric || !['1', 'any'].includes(attrs.get('step')!)))
    throw new Error('Unsupported numeric step');
  const enumeration = ['select', 'menulist', 'radiogroup'].includes(element.name);
  const radio = element.name === 'input' && inputType === 'radio';
  if (!enumeration && !radio) return bounds;
  const options: MarkupTag[] = [];
  if (radio) {
    const name = attrs.get('name');
    if (!name) throw new Error('Radio group has no static name');
    for (const candidate of elements) {
      if (
        candidate.name !== 'input' ||
        candidate.attributes.get('type')?.toLowerCase() !== 'radio' ||
        candidate.attributes.get('name') !== name
      )
        continue;
      if (
        (candidate.attributes.get('data-preference') ?? candidate.attributes.get('preference')) !==
        (attrs.get('data-preference') ?? attrs.get('preference'))
      )
        throw new Error('Ambiguous radio group binding');
      options.push(candidate);
    }
  } else {
    const visit = (children: readonly MarkupTag[]): void => {
      for (const child of children) {
        if (['option', 'menuitem', 'radio'].includes(child.name)) options.push(child);
        else if (['optgroup', 'menupopup'].includes(child.name)) visit(child.children);
        else throw new Error('Dynamic or unsupported enumeration');
        if (
          [...child.attributes.keys()].some((name) => name.startsWith('on')) ||
          ['disabled', 'readonly', 'hidden'].some((name) => child.attributes.has(name))
        )
          throw new Error('Dynamic or disabled enumeration');
      }
    };
    visit(element.children);
  }
  const values: (boolean | number | string)[] = [];
  for (const option of options) {
    const raw = option.attributes.get('value');
    if (
      raw === undefined ||
      /[&\0]/u.test(raw) ||
      option.children.length ||
      [...option.attributes.keys()].some((name) => name.startsWith('on')) ||
      ['disabled', 'readonly', 'hidden'].some((name) => option.attributes.has(name))
    )
      throw new Error('Enumeration value is not a static literal');
    const value =
      type === 'string'
        ? raw
        : type === 'number' &&
            /^-?\d+$/u.test(raw) &&
            Number.isInteger(Number(raw)) &&
            Number(raw) >= -2147483648 &&
            Number(raw) <= 2147483647
          ? Number(raw)
          : type === 'boolean' && /^(true|false)$/u.test(raw)
            ? raw === 'true'
            : undefined;
    if (value === undefined || values.includes(value))
      throw new Error('Invalid or duplicate enumeration value');
    values.push(value);
  }
  if (!values.length) throw new Error('Enumeration has no static options');
  values.sort((a, b) => String(a).localeCompare(String(b)));
  return { ...bounds, values: Object.freeze(values) };
}
export function discoverPluginTemplates(
  plugins: readonly MainTemplatePlugin[],
  host: TemplateDiscovery,
): readonly SnapshotPluginTemplate[] {
  const declarations = new Map(plugins.map((plugin) => [plugin.id, declaredDefaults(plugin)]));
  const owners = new Map<string, Set<string>>();
  for (const [id, defaults] of declarations)
    for (const key of defaults.keys()) {
      const ids = owners.get(key) ?? new Set<string>();
      ids.add(id);
      owners.set(key, ids);
    }
  const nativePrefix = 'extensions.zotero.';
  return plugins.map((plugin) => {
    const issues = [
      ...plugin.issues,
      'Static bindings only: scripted/dynamic controls, custom stores and unbound settings are not discovered; this is not universal plugin support',
    ];
    const defaults = declarations.get(plugin.id)!;
    const nativeKeys = plugin.nativePreferenceKeys ? new Set(plugin.nativePreferenceKeys) : null;
    const fields = new Map<string, SnapshotTemplateField>();
    let unbound = 0;
    for (const source of plugin.panes) {
      let elements: MarkupTag[];
      try {
        elements = tags(source.text);
      } catch {
        issues.push('A pane contains unsupported or malformed markup and was not scanned');
        continue;
      }
      const preferences = new Map<string, { key: string; type: string }>();
      const duplicateIDs = new Set<string>();
      for (const element of elements)
        if (element.name === 'preference') {
          const id = element.attributes.get('id'),
            key = element.attributes.get('name');
          if (id && key) {
            if (preferences.has(id) || duplicateIDs.has(id)) {
              preferences.delete(id);
              duplicateIDs.add(id);
              issues.push('Duplicate preference binding IDs are unsupported');
            } else preferences.set(id, { key, type: element.attributes.get('type') ?? '' });
          }
        }
      for (const element of elements) {
        if (element.name === 'preference') continue;
        const attrs = element.attributes;
        const binding = attrs.get('data-preference') ?? attrs.get('preference');
        const control = [
          'input',
          'checkbox',
          'textbox',
          'menulist',
          'select',
          'radiogroup',
          'textarea',
          'button',
          'slider',
        ].includes(element.name);
        if (!binding) {
          if (control) unbound++;
          continue;
        }
        const declared = preferences.get(binding);
        const key = declared?.key ?? binding;
        const type = defaults.get(key) ?? host.preferenceType(key) ?? 'string';
        const inputType = (attrs.get('type') ?? 'text').toLowerCase();
        const nativeTarget =
          key === 'extensions.zotero' ||
          nativeKeys?.has(key) ||
          (!nativeKeys && key.startsWith(nativePrefix));
        let reason: string | undefined;
        if (!plugin.available || !plugin.version)
          reason = 'The installed plugin version is unavailable or incompatible';
        else if (
          !KEY.test(key) ||
          RESERVED.test(key) ||
          nativeTarget ||
          !defaults.get(key) ||
          owners.get(key)?.size !== 1
        )
          reason =
            'This target is reserved, shared, or not uniquely declared by this installed plugin';
        else if (UNSAFE.test(key))
          reason =
            'Device paths, executable/code-bearing or complex settings require a dedicated trusted adapter';
        else if (
          !control ||
          ['textarea', 'button', 'slider'].includes(element.name) ||
          (element.name === 'input' &&
            !['text', 'password', 'number', 'checkbox', 'radio'].includes(inputType))
        )
          reason = 'This control requires custom semantics and is unsupported';
        else if (
          [...attrs.keys()].some((name) => name.startsWith('on')) ||
          attrs.has('readonly') ||
          attrs.has('disabled')
        )
          reason = 'Scripted, read-only or disabled controls require a dedicated trusted adapter';
        else if ((element.name === 'checkbox' || inputType === 'checkbox') && type !== 'boolean')
          reason = 'Control type disagrees with its declared preference type';
        else if (inputType === 'number' && type !== 'number')
          reason = 'Control type disagrees with its declared preference type';
        else if (host.preferenceType(key) !== type)
          reason = 'Preference type is unknown or differs from its bundled declaration';
        let declaredConstraints: ControlConstraints = {};
        if (!reason) {
          try {
            declaredConstraints = constraints(element, elements, type);
          } catch {
            reason = 'Control constraints are dynamic, ambiguous or unsupported';
          }
        }
        const previous = fields.get(key);
        if (
          previous &&
          (previous.type !== type ||
            !previous.supported ||
            previous.minimum !== declaredConstraints.minimum ||
            previous.maximum !== declaredConstraints.maximum ||
            JSON.stringify(previous.values) !== JSON.stringify(declaredConstraints.values))
        )
          reason = 'Conflicting bindings require a dedicated trusted adapter';
        fields.set(
          key,
          Object.freeze({
            key,
            label: key,
            type,
            ...declaredConstraints,
            secret: SENSITIVE.test(key) || inputType === 'password' || !!previous?.secret,
            requiresRestart: true,
            supported: !reason,
            ...(reason ? { reason } : {}),
            source: source.source,
          }),
        );
        if (fields.size > MAX_FIELDS) throw new Error('Template field count exceeds limit');
      }
    }
    if (unbound) issues.push(`${unbound} controls have no static preference binding`);
    const sorted = [...fields.values()].sort((a, b) => a.key.localeCompare(b.key));
    const material = {
      id: plugin.id,
      version: plugin.version,
      available: plugin.available,
      defaults: plugin.defaults,
      panes: plugin.panes,
      fields: sorted,
      issues,
    };
    return Object.freeze({
      pluginID: plugin.id,
      adapterID: `plugin-${host.digest(plugin.id)}`,
      label: plugin.label,
      version: plugin.version,
      revision: host.digest(JSON.stringify(material)),
      status: plugin.available ? 'draft' : 'unavailable',
      fields: Object.freeze(sorted),
      reviewedKeys: Object.freeze([]),
      issues: Object.freeze(issues),
    });
  });
}
