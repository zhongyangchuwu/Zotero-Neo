export const LOCAL_RULE_ENGINE_REVISION = 1;
export const LOCAL_RULE_GEOMETRY_REVISION = 1;

export interface LocalRuleOptions {
  readonly version?: 1;
  readonly rules?: {
    readonly unruledTables?: {
      readonly enabled?: boolean;
      readonly minRows?: number;
      readonly minColumns?: number;
    };
    readonly graphicLabels?: {
      readonly enabled?: boolean;
      readonly maxFontSizeEm?: number;
      readonly maxGapEm?: number;
    };
    readonly ruledTables?: {
      readonly enabled?: boolean;
      readonly endpointToleranceEm?: number;
    };
    readonly compoundPanels?: {
      readonly enabled?: boolean;
      readonly maxGapEm?: number;
      readonly minOverlapRatio?: number;
    };
  };
  readonly association?: {
    readonly maxDistanceLines?: number;
    readonly minWidthEm?: number;
    readonly minHeightEm?: number;
  };
}

export interface LocalRuleProfile {
  readonly version: 1;
  readonly rules: {
    readonly unruledTables: {
      readonly enabled: boolean;
      readonly minRows: number;
      readonly minColumns: number;
    };
    readonly graphicLabels: {
      readonly enabled: boolean;
      readonly maxFontSizeEm: number;
      readonly maxGapEm: number;
    };
    readonly ruledTables: {
      readonly enabled: boolean;
      readonly endpointToleranceEm: number;
    };
    readonly compoundPanels: {
      readonly enabled: boolean;
      readonly maxGapEm: number;
      readonly minOverlapRatio: number;
    };
  };
  readonly association: {
    readonly maxDistanceLines: number;
    readonly minWidthEm: number;
    readonly minHeightEm: number;
  };
  /** Canonical effective configuration, including engine, geometry and rule revisions. Not a secret. */
  readonly fingerprint: string;
}

function section(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${path} must be an object`);
  const result = value as Record<string, unknown>;
  for (const key of Object.keys(result))
    if (!keys.includes(key)) throw new Error(`Unknown local rule parameter: ${path}.${key}`);
  return result;
}

function enabled(value: unknown, path: string): boolean {
  if (value === undefined) return true;
  if (typeof value !== 'boolean') throw new Error(`${path} must be a boolean`);
  return value;
}

function number(
  value: unknown,
  fallback: number,
  path: string,
  minimum = 0,
  maximum = Infinity,
  integer = false,
): number {
  if (value === undefined) return fallback;
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value <= minimum ||
    value > maximum ||
    (integer && !Number.isInteger(value))
  )
    throw new Error(
      `${path} must be ${integer ? 'an integer' : 'a finite number'} > ${minimum}${Number.isFinite(maximum) ? ` and <= ${maximum}` : ''}`,
    );
  return value;
}

function resolve(input: unknown): LocalRuleProfile {
  const root = section(input, 'localRules', ['version', 'rules', 'association']);
  if (root.version !== undefined && root.version !== 1)
    throw new Error('Unsupported local rule profile version');
  const r = section(root.rules, 'rules', [
    'unruledTables',
    'graphicLabels',
    'ruledTables',
    'compoundPanels',
  ]);
  const u = section(r.unruledTables, 'rules.unruledTables', ['enabled', 'minRows', 'minColumns']);
  const g = section(r.graphicLabels, 'rules.graphicLabels', [
    'enabled',
    'maxFontSizeEm',
    'maxGapEm',
  ]);
  const t = section(r.ruledTables, 'rules.ruledTables', ['enabled', 'endpointToleranceEm']);
  const c = section(r.compoundPanels, 'rules.compoundPanels', [
    'enabled',
    'maxGapEm',
    'minOverlapRatio',
  ]);
  const a = section(root.association, 'association', [
    'maxDistanceLines',
    'minWidthEm',
    'minHeightEm',
  ]);
  const rules = Object.freeze({
    unruledTables: Object.freeze({
      enabled: enabled(u.enabled, 'rules.unruledTables.enabled'),
      minRows: number(u.minRows, 3, 'rules.unruledTables.minRows', 1, Infinity, true),
      minColumns: number(u.minColumns, 2, 'rules.unruledTables.minColumns', 1, Infinity, true),
    }),
    graphicLabels: Object.freeze({
      enabled: enabled(g.enabled, 'rules.graphicLabels.enabled'),
      maxFontSizeEm: number(g.maxFontSizeEm, 1.4, 'rules.graphicLabels.maxFontSizeEm'),
      maxGapEm: number(g.maxGapEm, 0.8, 'rules.graphicLabels.maxGapEm'),
    }),
    ruledTables: Object.freeze({
      enabled: enabled(t.enabled, 'rules.ruledTables.enabled'),
      endpointToleranceEm: number(
        t.endpointToleranceEm,
        0.2,
        'rules.ruledTables.endpointToleranceEm',
      ),
    }),
    compoundPanels: Object.freeze({
      enabled: enabled(c.enabled, 'rules.compoundPanels.enabled'),
      maxGapEm: number(c.maxGapEm, 1.5, 'rules.compoundPanels.maxGapEm'),
      minOverlapRatio: number(c.minOverlapRatio, 0.4, 'rules.compoundPanels.minOverlapRatio', 0, 1),
    }),
  });
  const association = Object.freeze({
    maxDistanceLines: number(a.maxDistanceLines, 5, 'association.maxDistanceLines'),
    minWidthEm: number(a.minWidthEm, 3, 'association.minWidthEm'),
    minHeightEm: number(a.minHeightEm, 2, 'association.minHeightEm'),
  });
  const fingerprint = JSON.stringify([
    LOCAL_RULE_ENGINE_REVISION,
    LOCAL_RULE_GEOMETRY_REVISION,
    1,
    ['unruledTables', 1, rules.unruledTables],
    ['graphicLabels', 1, rules.graphicLabels],
    ['ruledTables', 1, rules.ruledTables],
    ['compoundPanels', 1, rules.compoundPanels],
    association,
  ]);
  return Object.freeze({ version: 1, rules, association, fingerprint });
}

export const DEFAULT_LOCAL_RULE_PROFILE: LocalRuleProfile = resolve(undefined);

/** Validate once per extraction/configuration change, never once per page or rule. */
export function resolveLocalRuleProfile(input?: unknown): LocalRuleProfile {
  return input === undefined ? DEFAULT_LOCAL_RULE_PROFILE : resolve(input);
}

/** Empty advanced preference means the standard profile. Invalid configuration never silently falls back. */
export function parseLocalRuleProfile(text: string): LocalRuleProfile {
  if (typeof text !== 'string') throw new Error('Local rule profile must be a JSON string');
  if (!text.trim()) return DEFAULT_LOCAL_RULE_PROFILE;
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new Error('Local rule profile must be valid JSON');
  }
  return resolveLocalRuleProfile(input);
}
