import type { Cleanup } from '../../core/cleanup';
import type { MainWindow } from '../../core/contracts';
import type { BindingMap } from '../../input/bindings';
import type { KeyGuideLanguage } from '../../input/key-guide-config';
import type { TabDocumentRef, TabEnhancementHost } from '../../toolkit/main/tab-enhancements-types';

export interface SavedTabMember {
  readonly id: string;
  readonly document: TabDocumentRef;
  readonly title: string;
}
export interface SavedTabGroup {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly collapsed: boolean;
  readonly members: readonly SavedTabMember[];
}
export interface TabGroupState {
  readonly version: 1;
  readonly groups: readonly SavedTabGroup[];
}
export interface TabSidebarEntry {
  readonly id: string;
  readonly title: string;
  readonly nativeTitle: string;
  readonly status: 'open' | 'other-window' | 'closed' | 'missing';
  readonly selected: boolean;
  readonly kind: 'reader' | 'note' | 'library' | 'other';
}
export interface TabSidebarGroup {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly collapsed: boolean;
  readonly entries: readonly TabSidebarEntry[];
}
export interface TabSidebarView {
  readonly library: TabSidebarEntry | null;
  readonly groups: readonly TabSidebarGroup[];
  readonly ungrouped: readonly TabSidebarEntry[];
}

/** A registered Main lifetime activates through its existing Workspace navigation owner. */
export interface TabGroupHost {
  readonly native: TabEnhancementHost;
  activate(nativeID: string): boolean;
}
export interface TabGroupManagerOptions {
  read(): string;
  write(value: string): void;
  createID(): string;
}
export interface TabGroupManager {
  registerHost(host: TabGroupHost): Cleanup;
  refresh(hostID: string): void;
  subscribe(listener: () => void): Cleanup;
  view(hostID: string, titleFormat: string): TabSidebarView;
  createGroup(name: string): string;
  importDocuments(
    destination: { readonly name: string } | { readonly groupID: string },
    documents: readonly { readonly document: TabDocumentRef; readonly title: string }[],
  ): number;
  renameGroup(groupID: string, name: string): void;
  setGroupColor(groupID: string, color: string): void;
  toggleGroup(groupID: string): void;
  assign(memberID: string, groupID: string, hostID: string, beforeMemberID?: string | null): void;
  removeMember(memberID: string, hostID: string): void;
  moveMember(
    memberID: string,
    groupID: string | null,
    beforeMemberID: string | null,
    hostID: string,
  ): void;
  moveGroup(groupID: string, beforeGroupID: string | null, hostID: string): void;
  ungroup(groupID: string, hostID: string): void;
  activate(memberID: string, hostID: string): Promise<void>;
  closeMember(memberID: string, hostID: string): void;
  openGroup(groupID: string, hostID: string): Promise<void>;
  closeGroup(groupID: string, hostID: string): void;
  dispose(): void;
}

export interface TabSidebarCallbacks {
  toggleSidebar(): void;
  activate(memberID: string): void;
  close(memberID: string): void;
  createGroup(name: string, memberID?: string): void;
  renameGroup(groupID: string, name: string): void;
  setGroupColor(groupID: string, color: string): void;
  toggleGroup(groupID: string): void;
  openGroup(groupID: string): void;
  closeGroup(groupID: string): void;
  ungroup(groupID: string): void;
  removeMember(memberID: string): void;
  moveMember(memberID: string, groupID: string | null, beforeMemberID: string | null): void;
  moveGroup(groupID: string, beforeGroupID: string | null): void;
  leave(): void;
}
export interface TabSidebarOptions {
  readonly window: MainWindow;
  readonly bindings: () => BindingMap;
  readonly language: () => KeyGuideLanguage;
  readonly isCurrent: () => boolean;
  readonly callbacks: TabSidebarCallbacks;
  readonly themeRoot: (root: HTMLElement) => Cleanup;
}
