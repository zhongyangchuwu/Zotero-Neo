import { installedPlugins } from '../../plugin-host';
import type { PickerItem } from '../model';
import type { PickerPreview, PickerProvider } from '../types';

export function createPluginsProvider(): PickerProvider {
  return {
    title: 'Plugins',
    placeholder: '> Search installed plugins…',
    loadingText: 'Loading installed plugins…',
    async load() {
      const plugins = await installedPlugins();
      return plugins.map((plugin): PickerItem => ({
        id: plugin.id,
        title: plugin.name,
        search: `${plugin.name} ${plugin.id} ${plugin.version}`.toLowerCase(),
        kind: 'Plugin',
        meta: plugin.enabled ? 'Enabled' : 'Disabled',
        preview: [
          `Version: ${plugin.version || 'Unknown'}`,
          `Status: ${plugin.enabled ? 'Enabled' : 'Disabled'}`,
          `ID: ${plugin.id}`,
        ].join('\n'),
      }));
    },
    rowText: (item) =>
      `${item.title}${item.meta ? ` · ${item.meta}` : ''}`,
    preview: (item): PickerPreview => ({
      title: item.title,
      body: item.preview || String(item.id),
    }),
  };
}
