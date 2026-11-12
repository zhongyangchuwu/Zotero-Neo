import type { MainWindow } from '../../core/contracts';
import { t } from '../../i18n';
import type { KeyGuideLanguage } from '../../input/key-guide-config';
import type { MainResolvedTargets } from '../../main/action-targets';
import {
  snapshotReadingGroupDocuments,
  type ReadingGroupDocument,
} from '../../operations/reading-group-documents';
import {
  alertChromeAction,
  chooseChromeAction,
  confirmChromeAction,
  promptChromeText,
} from '../../platform/chrome-windows';
import type { TabGroupManager } from './types';

export async function importReadingSelection(options: {
  window: MainWindow;
  language: KeyGuideLanguage;
  targets: MainResolvedTargets;
  groups: TabGroupManager;
  hostID: string;
  titleFormat: string;
  create: boolean;
  isCurrent(): boolean;
}): Promise<void> {
  const { window, language, groups, hostID, titleFormat, isCurrent } = options;
  const snapshot = snapshotReadingGroupDocuments(options.targets.items, options.targets.missing);
  const title = t('tabs.selectionImportTitle', language);
  const alert = (message: string) => {
    if (isCurrent()) alertChromeAction(window, title, message);
  };
  if (snapshot.missing)
    alert(t('tabs.selectionMissing', language).replace('{count}', String(snapshot.missing)));
  if (!isCurrent()) return;
  const documents: ReadingGroupDocument[] = [];
  for (const candidate of snapshot.candidates) {
    if (candidate.documents.length === 1) {
      documents.push(candidate.documents[0]!);
      continue;
    }
    const selected = chooseChromeAction(
      window,
      title,
      `${t('tabs.choosePdf', language)}\n${candidate.title}`,
      candidate.documents.map((entry) => entry.choiceLabel),
    );
    if (selected === null || !isCurrent()) return;
    const document = candidate.documents[selected];
    if (!document) return;
    documents.push(document);
  }
  if (!documents.length) {
    alert(t('tabs.selectionEmpty', language));
    return;
  }
  let destination: { name: string } | { groupID: string };
  if (options.create) {
    const name = promptChromeText(window, title, t('tabs.selectionGroupName', language));
    if (name === null || !isCurrent()) return;
    if (!name.trim()) {
      alert(t('tabs.emptyName', language));
      return;
    }
    destination = { name };
  } else {
    const choices = groups.view(hostID, titleFormat).groups;
    if (!choices.length) {
      alert(t('tabs.selectionNoGroups', language));
      return;
    }
    const names = new Map<string, number>();
    for (const group of choices) names.set(group.name, (names.get(group.name) ?? 0) + 1);
    const labels = choices.map((group) =>
      names.get(group.name)! > 1 ? `${group.name} · ${group.id}` : group.name,
    );
    const selected = chooseChromeAction(
      window,
      title,
      t('tabs.selectionChooseGroup', language),
      labels,
    );
    if (selected === null || !isCurrent()) return;
    const group = choices[selected];
    if (!group) return;
    destination = { groupID: group.id };
  }
  if (!isCurrent()) return;
  if (!confirmChromeAction(window, title, t('tabs.selectionOpensTabs', language)) || !isCurrent())
    return;
  const count = await groups.importDocuments(destination, documents, hostID, isCurrent);
  alert(t('tabs.selectionAdded', language).replace('{count}', String(count)));
}
