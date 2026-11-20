import type { MainWindow } from '../../core/contracts';
import type { Logger } from '../../core/logging';
import { t } from '../../i18n';
import { batchStatus, type BatchOutcome } from '../../i18n/batch-result';
import type { KeyGuideLanguage } from '../../input/key-guide-config';
import type { MainResolvedTargets } from '../../main/action-targets';
import {
  snapshotReadingGroupDocuments,
  type ReadingGroupDocument,
} from '../../operations/reading-group-documents';
import {
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
  logger: Logger;
  status(message: string): void;
  isCurrent(): boolean;
}): Promise<void> {
  const { window, language, groups, hostID, titleFormat, isCurrent, status } = options;
  if (!isCurrent()) return;
  const snapshot = snapshotReadingGroupDocuments(
    options.targets.items,
    options.targets.missing,
    options.logger,
  );
  const title = t('tabs.selectionImportTitle', language);
  const result: BatchOutcome = {
    done: 0,
    unavailable: snapshot.missing,
    missingData: snapshot.missingData,
    failed: snapshot.failed,
  };
  const report = () => {
    if (isCurrent()) status(batchStatus('readingGroup', result, language));
  };
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
    if (!isCurrent()) return;
    const document = selected === null ? undefined : candidate.documents[selected];
    if (!document) {
      result.unchanged = (result.unchanged ?? 0) + 1;
      continue;
    }
    documents.push(document);
  }
  if (!documents.length) {
    report();
    return;
  }
  let destination: { name: string } | { groupID: string };
  if (options.create) {
    const name = promptChromeText(window, title, t('tabs.selectionGroupName', language));
    if (name === null || !isCurrent()) return;
    if (!name.trim()) {
      status(t('tabs.emptyName', language));
      return;
    }
    destination = { name };
  } else {
    const choices = groups.view(hostID, titleFormat).groups;
    if (!choices.length) {
      if (isCurrent()) status(t('tabs.selectionNoGroups', language));
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
  const opened = await groups.importDocuments(destination, documents, hostID, isCurrent);
  result.done = opened.done;
  result.unchanged = (result.unchanged ?? 0) + (opened.unchanged ?? 0);
  result.unavailable = (result.unavailable ?? 0) + (opened.unavailable ?? 0);
  result.failed = (result.failed ?? 0) + (opened.failed ?? 0);
  report();
}
