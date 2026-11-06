import type { MainWindow } from '../../core/contracts';
import { t } from '../../i18n';
import type { KeyGuideLanguage } from '../../input/key-guide-config';
import type { MainResolvedTargets } from '../../main/action-targets';
import type { TabDocumentRef } from '../../toolkit/main/tab-enhancements-types';
import type { TabGroupManager } from './types';

type Document = { readonly document: TabDocumentRef; readonly title: string };
type Candidate = { readonly title: string; readonly documents: readonly Document[] };

/** Snapshot attachment identities before any dialog changes the Main selection. */
export function snapshotReadingTargets(targets: MainResolvedTargets): { candidates: Candidate[]; missing: number } {
  let missing = targets.missing;
  const candidates: Candidate[] = [];
  for (const item of targets.items) {
    if (item.deleted) { missing++; continue; }
    const attachments = item.isRegularItem()
      ? item.getAttachments().map((id) => Zotero.Items.get(id))
      : [item];
    const documents = attachments.flatMap((attachment): Document[] => {
      if (!attachment || attachment.deleted || !attachment.isPDFAttachment()) return [];
      return [{
        document: { kind: 'reader', libraryID: attachment.libraryID, key: attachment.key },
        title: String(attachment.getField('title') || attachment.attachmentFilename || 'PDF').slice(0, 2000),
      }];
    });
    if (!documents.length) { missing++; continue; }
    candidates.push({ title: String(item.getField('title') || 'PDF'), documents });
  }
  return { candidates, missing };
}

interface PromptService {
  select(parent: Window | null, title: string, text: string, count: number, choices: string[], selected: { value: number }): boolean;
  prompt(parent: Window | null, title: string, text: string, value: { value: string }, checkMessage: null, check: { value: boolean }): boolean;
  alert(parent: Window | null, title: string, text: string): void;
}

export function importReadingSelection(options: {
  window: MainWindow;
  language: KeyGuideLanguage;
  targets: MainResolvedTargets;
  groups: TabGroupManager;
  hostID: string;
  titleFormat: string;
  create: boolean;
  isCurrent(): boolean;
}): void {
  const { window, language, groups, hostID, titleFormat, isCurrent } = options;
  const snapshot = snapshotReadingTargets(options.targets);
  const prompt = Services.prompt as unknown as PromptService;
  const title = t('tabs.selectionImportTitle', language);
  const alert = (message: string) => { if (isCurrent()) prompt.alert(window, title, message); };
  if (snapshot.missing) alert(t('tabs.selectionMissing', language).replace('{count}', String(snapshot.missing)));
  if (!isCurrent()) return;
  const documents: Document[] = [];
  for (const candidate of snapshot.candidates) {
    if (candidate.documents.length === 1) { documents.push(candidate.documents[0]!); continue; }
    const selected = { value: 0 };
    const choices = candidate.documents.map((entry) => entry.title);
    if (!prompt.select(window, title, `${t('tabs.choosePdf', language)}\n${candidate.title}`, choices.length, choices, selected) || !isCurrent()) return;
    const document = candidate.documents[selected.value];
    if (!document) return;
    documents.push(document);
  }
  if (!documents.length) { alert(t('tabs.selectionEmpty', language)); return; }
  let destination: { name: string } | { groupID: string };
  if (options.create) {
    const value = { value: '' };
    if (!prompt.prompt(window, title, t('tabs.selectionGroupName', language), value, null, { value: false }) || !isCurrent()) return;
    if (!value.value.trim()) { alert(t('tabs.emptyName', language)); return; }
    destination = { name: value.value };
  } else {
    const choices = groups.view(hostID, titleFormat).groups;
    if (!choices.length) { alert(t('tabs.selectionNoGroups', language)); return; }
    const selected = { value: 0 };
    if (!prompt.select(window, title, t('tabs.selectionChooseGroup', language), choices.length, choices.map((group) => group.name), selected) || !isCurrent()) return;
    const group = choices[selected.value];
    if (!group) return;
    destination = { groupID: group.id };
  }
  if (!isCurrent()) return;
  const count = groups.importDocuments(destination, documents);
  alert(t('tabs.selectionAdded', language).replace('{count}', String(count)));
}
