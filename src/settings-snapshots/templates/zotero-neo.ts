import {
  APPEARANCE_CUSTOM_CSS_KEY,
  APPEARANCE_PRESET_KEY,
  isAppearancePreset,
} from '../../core/appearance-preferences';
import {
  READER_SCROLL_NUMBER_SPECS,
  KEY_GUIDE_NUMBER_SPECS,
  MAIN_STARTUP_FOCUS_PREFERENCE_KEY,
  isMainStartupFocus,
} from '../../core/preferences';
import { OPTIONAL_MODULE_IDS } from '../../modules';
import type { SettingsValue } from '../contracts';
import { fields, validBindings, type TransferField } from '../adapters/fields';

export const NEO_PREFERENCE_FIELDS: readonly TransferField[] = [
  {
    key: MAIN_STARTUP_FOCUS_PREFERENCE_KEY,
    label: 'Startup focus',
    type: 'string',
    category: 'Interaction',
    validate: isMainStartupFocus,
  },
  ...fields(
    'boolean',
    'Interaction',
    'picker.mouse.enabled mode.visual.enabled marks.persist smoothScroll.stopOnRelease keyGuide.enabled',
  ),
  ...fields(
    'string',
    'Interaction',
    'language tags.separator defaultHighlightColor scroll.mode appearance.theme appearance.interaction.colorPreset appearance.interaction.markerWeight appearance.interaction.statusStyle appearance.interaction.customThemes',
  ),
  ...fields('number', 'Interaction', 'appearance.interaction.markerWidth'),
  {
    key: APPEARANCE_PRESET_KEY,
    label: APPEARANCE_PRESET_KEY,
    type: 'string',
    category: 'Appearance',
    validate: isAppearancePreset,
  },
  ...fields('string', 'Appearance', APPEARANCE_CUSTOM_CSS_KEY),
  ...Object.values(READER_SCROLL_NUMBER_SPECS).map(({ key, minimum, maximum }) => ({
    key,
    label: key,
    type: 'number' as const,
    category: 'Reader scrolling',
    validate: (value: SettingsValue) =>
      typeof value === 'number' && value >= minimum && value <= maximum,
  })),
  ...Object.values(KEY_GUIDE_NUMBER_SPECS).map(({ key, minimum, maximum }) => ({
    key,
    label: key,
    type: 'number' as const,
    category: 'Key guide',
    validate: (value: SettingsValue) =>
      typeof value === 'number' && value >= minimum && value <= maximum,
  })),
  ...OPTIONAL_MODULE_IDS.map((id) => ({
    key: `modules.${id}.enabled`,
    label: `Module: ${id}`,
    type: 'boolean' as const,
    category: 'Modules',
    restart: true,
    last: true,
  })),
  {
    key: 'bindings',
    label: 'Canonical key bindings',
    category: 'Key bindings',
    validate: validBindings,
  },
  ...fields('number', 'Migration metadata', 'interaction.defaultsVersion'),
];
