import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { discoverPluginTemplates } from '../../src/settings-snapshots/templates/scanner';
import type { MainTemplatePlugin } from '../../src/toolkit/main';

const digest = (text: string): string => createHash('sha256').update(text).digest('hex');
function plugin(id = 'Sample@Example.test', key = 'extensions.sample.enabled'): MainTemplatePlugin {
  return {
    id,
    label: 'Same label',
    version: '1.0',
    available: true,
    defaults: [{ source: 'prefs.js', text: `pref("${key}", true);` }],
    panes: [{ source: 'preferences.xhtml', text: `<checkbox preference="${key}"/>` }],
    issues: [],
    nativePreferenceKeys: [
      'extensions.zotero.automaticTags',
      'extensions.zotero.keys.openZotero',
      'extensions.zotero.purge.items',
      'extensions.zotero.cite.useCiteprocRs',
    ],
  };
}
const host = { digest, preferenceType: (_key: string): 'boolean' => 'boolean' };

describe('inert bundled preference template discovery', () => {
  it('binds exact plugin identity and static defaults without executing scripts or reading user values', () => {
    const source = plugin();
    const candidate = {
      ...source,
      panes: [
        {
          source: 'preferences.xhtml',
          text:
            '<script src="https://foreign.invalid/script.js">throw new Error("Must not execute")</script>' +
            '<img src="https://foreign.invalid/image.png"/>' +
            '<preference id="enabled" name="extensions.sample.enabled" type="bool"/>' +
            '<checkbox preference="enabled"/><button onclick="writeSomething()"/>',
        },
      ],
    };
    const [template] = discoverPluginTemplates([candidate], host);
    expect(template).toMatchObject({ pluginID: source.id, status: 'draft', reviewedKeys: [] });
    expect(template!.fields).toEqual([
      expect.objectContaining({
        key: 'extensions.sample.enabled',
        supported: true,
        type: 'boolean',
      }),
    ]);
    expect(template!.issues.join(' ')).toMatch(/dynamic.*not discovered/u);
    expect(template!.issues.join(' ')).toContain('no static preference binding');
  });

  it('does not collide when labels or lossy slugs match, including plugin ID case', () => {
    const templates = discoverPluginTemplates(
      [
        plugin('a@b', 'extensions.first.enabled'),
        plugin('a-b', 'extensions.second.enabled'),
        plugin('A@b', 'extensions.third.enabled'),
      ],
      host,
    );
    expect(new Set(templates.map((template) => template.adapterID)).size).toBe(3);
    for (const template of templates)
      expect(template.adapterID).toMatch(/^[a-z][a-z0-9.-]{0,127}$/u);
  });

  it('admits uniquely declared real Zotero plugin branches, including nested translator branches', () => {
    const translateKey = 'extensions.zotero.ZoteroPDFTranslate.enableAuto';
    const bibtexKey = 'extensions.zotero.translators.better-bibtex.autoExport';
    const templates = discoverPluginTemplates(
      [
        plugin('zoteropdftranslate@euclpts.com', translateKey),
        plugin('better-bibtex@iris-advies.com', bibtexKey),
      ],
      host,
    );
    expect(templates.map((template) => template.fields[0])).toEqual([
      expect.objectContaining({ key: translateKey, supported: true }),
      expect.objectContaining({ key: bibtexKey, supported: true }),
    ]);
  });

  it('rejects native targets and shared standard-prefix keys despite bundled plugin declarations', () => {
    const shared = 'extensions.zotero.ZoteroPDFTranslate.enableAuto';
    const templates = discoverPluginTemplates(
      [
        plugin('first@test', shared),
        plugin('second@test', shared),
        plugin('native-claim@test', 'extensions.zotero.automaticTags'),
        plugin('internal-claim@test', 'extensions.zotero.keys.openZotero'),
        plugin('purge-claim@test', 'extensions.zotero.purge.items'),
        plugin('cite-claim@test', 'extensions.zotero.cite.useCiteprocRs'),
      ],
      host,
    );
    expect(templates.every((template) => !template.fields[0]!.supported)).toBe(true);
    expect(
      templates.every((template) => template.fields[0]!.reason!.includes('reserved, shared')),
    ).toBe(true);
  });

  it.each([
    ['extensions.zotero.automaticTags', '<checkbox preference="extensions.zotero.automaticTags"/>'],
    [
      'extensions.zotero-neo.keyGuide.enabled',
      '<checkbox preference="extensions.zotero-neo.keyGuide.enabled"/>',
    ],
    ['extensions.sample.file', '<input type="file" data-preference="extensions.sample.file"/>'],
    [
      'extensions.sample.enabled',
      '<checkbox preference="extensions.sample.enabled" onchange="customWrite()"/>',
    ],
    ['extensions.sample.enabled', '<custom-control preference="extensions.sample.enabled"/>'],
  ])('reports unsupported or reserved targets without admitting them: %s', (key, markup) => {
    const source = plugin('sample@test', key);
    const [template] = discoverPluginTemplates(
      [{ ...source, panes: [{ source: 'preferences.xhtml', text: markup }] }],
      host,
    );
    expect(template!.fields).toHaveLength(1);
    expect(template!.fields[0]).toMatchObject({ supported: false, reason: expect.any(String) });
  });

  it('rejects shared and unowned targets and unknown preference types', () => {
    const [shared] = discoverPluginTemplates([plugin('first@test'), plugin('second@test')], host);
    expect(shared!.fields[0]!.supported).toBe(false);
    const source = plugin();
    const [unowned] = discoverPluginTemplates([{ ...source, defaults: [] }], host);
    expect(unowned!.fields[0]!.supported).toBe(false);
    const [unknown] = discoverPluginTemplates([source], { digest, preferenceType: () => null });
    expect(unknown!.fields[0]!.supported).toBe(false);
  });

  it('does not infer ownership from dynamic defaults or entity-bearing markup', () => {
    const source = plugin();
    const [dynamic] = discoverPluginTemplates(
      [
        {
          ...source,
          defaults: [
            {
              source: 'prefs.js',
              text: 'if (someCondition) {\npref("extensions.sample.enabled", true);\n}',
            },
          ],
        },
      ],
      host,
    );
    expect(dynamic!.fields[0]!.supported).toBe(false);
    const [entity] = discoverPluginTemplates(
      [
        {
          ...source,
          panes: [
            {
              source: 'preferences.xhtml',
              text: '<!DOCTYPE pane SYSTEM "https://foreign.invalid/entity"><checkbox preference="extensions.sample.enabled"/>',
            },
          ],
        },
      ],
      host,
    );
    expect(entity!.fields).toEqual([]);
    expect(entity!.issues.join(' ')).toContain('unsupported or malformed markup');
  });

  it('fails closed for native-prefix claims without trusted inventory, not unrelated plugin namespaces', () => {
    const templates = discoverPluginTemplates(
      [
        { ...plugin('native@test', 'extensions.zotero.purge.items'), nativePreferenceKeys: null },
        {
          ...plugin('translate@test', 'extensions.zotero.ZoteroPDFTranslate.enableAuto'),
          nativePreferenceKeys: undefined,
        },
        { ...plugin('other@test', 'extensions.sample.enabled'), nativePreferenceKeys: null },
      ],
      host,
    );
    expect(templates.map((template) => template.fields[0]!.supported)).toEqual([
      false,
      false,
      true,
    ]);
  });

  it('parses multiline literal statements, trailing commas, comments and comment-like string content inertly', () => {
    const source = plugin('translate@test', 'extensions.zotero.ZoteroPDFTranslate.mode');
    const [template] = discoverPluginTemplates(
      [
        {
          ...source,
          defaults: [
            {
              source: 'prefs.js',
              text: `/* Translate 2.4.8 style */
          pref /* before call */ (
            "extensions.zotero.ZoteroPDFTranslate.mode", // key
            "literal /* not a comment */ // still a string",
          );
          pref('extensions.translate.other', true,);
        `,
            },
          ],
          panes: [
            {
              source: 'preferences.xhtml',
              text: '<input data-preference="extensions.zotero.ZoteroPDFTranslate.mode"/>',
            },
          ],
        },
      ],
      { digest, preferenceType: () => 'string' },
    );
    expect(template!.fields[0]).toMatchObject({ type: 'string', supported: true });
  });

  it.each([
    'pref("extensions.sample.enabled", (() => { throw new Error("Must not execute"); })());',
    'pref("extensions.sample.enabled", true); globalThis.templateScannerExecuted = true;',
    'pref("extensions.sample.enabled", true); pref("extensions.sample.enabled", false);',
    'pref("extensions.sample.enabled", true, { locked: true });',
  ])('never grants ownership from executable or duplicate defaults: %s', (text) => {
    const [template] = discoverPluginTemplates(
      [
        {
          ...plugin(),
          defaults: [{ source: 'prefs.js', text }],
        },
      ],
      host,
    );
    expect(template!.fields[0]!.supported).toBe(false);
    expect((globalThis as Record<string, unknown>).templateScannerExecuted).toBeUndefined();
  });

  it('rejects duplicate declarations across bundled default files', () => {
    const source = plugin();
    const [template] = discoverPluginTemplates(
      [
        {
          ...source,
          defaults: [
            ...source.defaults,
            { source: 'defaults/preferences/prefs.js', text: source.defaults[0]!.text },
          ],
        },
      ],
      host,
    );
    expect(template!.fields[0]!.supported).toBe(false);
  });

  it('retains numeric bounds and static select, XUL menu and radio values in live fields', () => {
    const cases = [
      [
        'count',
        'number',
        '5',
        '<input type="number" data-preference="extensions.sample.count" min="1" max="10"/>',
        { minimum: 1, maximum: 10 },
      ],
      [
        'mode',
        'string',
        '"a"',
        '<select data-preference="extensions.sample.mode"><option value="a">A</option><option value="b">B</option></select>',
        { values: ['a', 'b'] },
      ],
      [
        'menu',
        'number',
        '1',
        '<menulist preference="extensions.sample.menu"><menupopup><menuitem value="1"/><menuitem value="2"/></menupopup></menulist>',
        { values: [1, 2] },
      ],
      [
        'radio',
        'string',
        '"a"',
        '<radiogroup preference="extensions.sample.radio"><radio value="a"/><radio value="b"/></radiogroup>',
        { values: ['a', 'b'] },
      ],
      [
        'radioChoice',
        'number',
        '1',
        '<input type="radio" name="choice" data-preference="extensions.sample.radioChoice" value="1"/><input type="radio" name="choice" data-preference="extensions.sample.radioChoice" value="2"/>',
        { values: [1, 2] },
      ],
    ] as const;
    for (const [name, type, value, markup, retained] of cases) {
      const key = `extensions.sample.${name}`;
      const [template] = discoverPluginTemplates(
        [
          {
            ...plugin('sample@test', key),
            defaults: [{ source: 'prefs.js', text: `pref("${key}", ${value});` }],
            panes: [{ source: 'preferences.xhtml', text: markup }],
          },
        ],
        { digest, preferenceType: () => type },
      );
      expect(template!.fields[0]).toMatchObject({ supported: true, ...retained });
      if (template!.fields[0]!.values)
        expect(Object.isFrozen(template!.fields[0]!.values)).toBe(true);
    }
  });

  it.each([
    '<input type="number" data-preference="extensions.sample.count" min="ten"/>',
    '<input type="number" data-preference="extensions.sample.count" min="10" max="1"/>',
    '<input type="number" data-preference="extensions.sample.count" step="2"/>',
    '<select data-preference="extensions.sample.count"><option>Implicit</option></select>',
    '<select data-preference="extensions.sample.count"><option value="1"/><option value="1"/></select>',
    '<select data-preference="extensions.sample.count"><option value="1" disabled="true"/></select>',
    '<select data-preference="extensions.sample.count"><custom-options/></select>',
    '<select data-preference="extensions.sample.count"><option value="1"/><script>throw new Error("Must not execute")</script></select>',
    '<input type="radio" data-preference="extensions.sample.count" value="1"/>',
    '<input type="number" data-preference="extensions.sample.count" min="1"/><input type="number" data-preference="extensions.sample.count" min="2"/>',
  ])('visibly rejects unrepresentable or conflicting constraints: %s', (markup) => {
    const key = 'extensions.sample.count';
    const [template] = discoverPluginTemplates(
      [
        {
          ...plugin('sample@test', key),
          defaults: [{ source: 'prefs.js', text: `pref("${key}", 1);` }],
          panes: [{ source: 'preferences.xhtml', text: markup }],
        },
      ],
      { digest, preferenceType: () => 'number' },
    );
    expect(template!.fields[0]).toMatchObject({ supported: false, reason: expect.any(String) });
  });

  it('keeps static bindings around explicitly closed namespaced XHTML inputs', () => {
    const enabled = 'extensions.sample.enabled';
    const text = 'extensions.sample.note';
    const [template] = discoverPluginTemplates(
      [
        {
          ...plugin(),
          defaults: [
            { source: 'prefs.js', text: `pref("${enabled}", true); pref("${text}", "");` },
          ],
          panes: [
            {
              source: 'preferences.xhtml',
              text: `<vbox onload="throw new Error('must not execute')"><html:input type="text" preference="${text}"></html:input><checkbox preference="${enabled}"/></vbox>`,
            },
          ],
        },
      ],
      { digest, preferenceType: (key) => (key === enabled ? 'boolean' : 'string') },
    );
    expect(template!.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: enabled, supported: true, type: 'boolean' }),
        expect.objectContaining({ key: text, supported: true, type: 'string' }),
      ]),
    );
  });

  it('changes revision for source, type, version and ownership changes', () => {
    const source = plugin();
    const original = discoverPluginTemplates([source], host)[0]!.revision;
    for (const changed of [
      { ...source, version: '2.0' },
      {
        ...source,
        panes: [{ source: 'preferences.xhtml', text: source.panes[0]!.text + '<label/>' }],
      },
    ])
      expect(discoverPluginTemplates([changed], host)[0]!.revision).not.toBe(original);
    expect(
      discoverPluginTemplates([source], { digest, preferenceType: () => 'string' })[0]!.revision,
    ).not.toBe(original);
    expect(discoverPluginTemplates([source, plugin('other@test')], host)[0]!.revision).not.toBe(
      original,
    );
  });
});
