import type { TabDocumentRef, TabViewSnapshot } from '../../toolkit/main/tab-enhancements-types';
import type {
  SavedTabMember,
  TabGroupHost,
  TabGroupManager,
  TabGroupManagerOptions,
  TabGroupState,
  TabSidebarEntry,
} from './types';
import { formatTabTitle } from './title-format';

type MutableGroup = {
  id: string;
  name: string;
  color: string;
  collapsed: boolean;
  members: SavedTabMember[];
};

type Registration = {
  host: TabGroupHost;
  cleanup: () => void;
  active: boolean;
  observed: Set<string>;
  opening: Set<string>;
  closedGroups: Map<string, number>;
  closed: Set<string>;
};

function validString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validColor(value: unknown): value is string {
  return typeof value === 'string' && (value === '' || /^#[a-f0-9]{6}$/i.test(value));
}

function parseState(raw: string): MutableGroup[] {
  if (!raw) return [];
  const state: unknown = JSON.parse(raw);
  if (!state || typeof state !== 'object' || Array.isArray(state))
    throw new Error('Invalid tab group state');
  const candidate = state as Partial<TabGroupState>;
  if ((candidate.version !== 1 && candidate.version !== 2) || !Array.isArray(candidate.groups))
    throw new Error('Unsupported tab group state');
  const groupIDs = new Set<string>();
  const memberIDs = new Set<string>();
  return candidate.groups.map((group) => {
    if (
      !group ||
      !validString(group.id) ||
      groupIDs.has(group.id) ||
      !validString(group.name) ||
      !validColor(group.color) ||
      typeof group.collapsed !== 'boolean' ||
      !Array.isArray(group.members)
    ) {
      throw new Error('Invalid tab group');
    }
    groupIDs.add(group.id);
    const members = group.members.map((member: SavedTabMember) => {
      const doc = member?.document;
      if (
        !member ||
        !validString(member.id) ||
        memberIDs.has(member.id) ||
        typeof member.title !== 'string' ||
        !doc ||
        (doc.kind !== 'reader' && doc.kind !== 'note') ||
        !Number.isSafeInteger(doc.libraryID) ||
        doc.libraryID <= 0 ||
        !validString(doc.key)
      ) {
        throw new Error('Invalid tab group member');
      }
      memberIDs.add(member.id);
      return {
        id: member.id,
        title: member.title,
        document: { kind: doc.kind, libraryID: doc.libraryID, key: doc.key },
      };
    });
    return {
      id: group.id,
      name: group.name,
      color: group.color,
      collapsed: group.collapsed,
      members,
    };
  });
}

export function createTabGroupManager(options: TabGroupManagerOptions): TabGroupManager {
  let stored = options.read();
  let groups = parseState(stored);
  if (stored && JSON.parse(stored).version === 1) {
    stored = JSON.stringify({ version: 2, groups });
    options.write(stored);
  }
  let mutatingNative = false;
  let disposed = false;
  const hosts = new Map<string, Registration>();
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const listener of [...listeners]) listener();
  }
  function requireActive(): void {
    if (disposed) throw new Error('Tab group manager is disposed');
  }
  function getGroup(id: string, source = groups): MutableGroup {
    const group = source.find((item) => item.id === id);
    if (!group) throw new Error(`Unknown tab group: ${id}`);
    return group;
  }
  function getHost(id: string): Registration {
    requireActive();
    const registration = hosts.get(id);
    if (!registration || !registration.active) throw new Error(`Unknown tab host: ${id}`);
    return registration;
  }
  function findMember(
    id: string,
    source = groups,
  ): { group: MutableGroup; member: SavedTabMember } | undefined {
    for (const group of source) {
      const member = group.members.find((item) => item.id === id);
      if (member) return { group, member };
    }
    return undefined;
  }
  function live(id: string): { registration: Registration; tab: TabViewSnapshot } | undefined {
    for (const registration of hosts.values()) {
      const tab = registration.host.native
        .snapshot()
        .find((item) => item.viewID === id && (item.kind === 'reader' || item.kind === 'note'));
      if (tab) return { registration, tab };
    }
    return undefined;
  }
  function commit(
    change: (draft: MutableGroup[]) => void,
    native?: { registration: Registration; apply: (draft: MutableGroup[]) => void },
  ): void {
    requireActive();
    const draft = groups.map((group) => ({ ...group, members: [...group.members] }));
    change(draft);
    const serialized = JSON.stringify({ version: 2, groups: draft });
    parseState(serialized);
    const priorOrder = native?.registration.host.native
      .snapshot()
      .filter((tab) => tab.kind !== 'library')
      .map((tab) => tab.nativeID);
    options.write(serialized);
    if (native && priorOrder) {
      mutatingNative = true;
      try {
        native.apply(draft);
      } catch (error) {
        const errors: unknown[] = [error];
        try {
          options.write(stored);
        } catch (rollbackError) {
          errors.push(rollbackError);
        }
        let before: string | null = null;
        for (let i = priorOrder.length - 1; i >= 0; i--) {
          const id = priorOrder[i]!;
          try {
            native.registration.host.native.move(id, before);
          } catch (rollbackError) {
            errors.push(rollbackError);
          }
          before = id;
        }
        if (errors.length > 1)
          throw new AggregateError(errors, 'Tab group change and compensation failed');
        throw error;
      } finally {
        mutatingNative = false;
      }
    }
    stored = serialized;
    groups = draft;
    notify();
  }
  function indexBefore<T extends { id: string }>(
    items: readonly T[],
    id: string | null | undefined,
  ): number {
    if (id == null) return items.length;
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) throw new Error(`Unknown insertion target: ${id}`);
    return index;
  }
  function reorderNative(registration: Registration, draft: MutableGroup[]): void {
    const tabs = registration.host.native.snapshot();
    const byID = new Map(tabs.map((tab) => [tab.viewID, tab]));
    const ordered = draft.flatMap((group) =>
      group.members.flatMap((member) => {
        const tab = byID.get(member.id);
        if (tab) return [tab.nativeID];
        return [];
      }),
    );
    const grouped = new Set(ordered);
    const current = tabs.filter((tab) => tab.kind !== 'library').map((tab) => tab.nativeID);
    const desired = [...ordered, ...current.filter((nativeID) => !grouped.has(nativeID))];
    if (desired.length === current.length && desired.every((id, index) => id === current[index]))
      return;
    let before: string | null = null;
    for (let index = desired.length - 1; index >= 0; index -= 1) {
      const nativeID = desired[index]!;
      registration.host.native.move(nativeID, before);
      before = nativeID;
    }
  }
  function makeSearchText(fields: TabViewSnapshot['fields'] | null, fallbackTitle: string): string {
    if (!fields) return fallbackTitle;
    return [
      fields.title,
      fields.nativeTitle || fallbackTitle,
      fields.author,
      fields.year,
      fields.filename,
      fields.citekey,
    ]
      .filter((value) => value.trim().length > 0)
      .join(' ');
  }

  function entry(
    tab: TabViewSnapshot,
    status: TabSidebarEntry['status'],
    format: string,
    fallbackTitle = '',
  ): TabSidebarEntry {
    return {
      id: tab.viewID,
      title: formatTabTitle(format, tab.fields),
      nativeTitle: tab.fields.nativeTitle,
      searchText: makeSearchText(tab.fields, fallbackTitle),
      status,
      selected: status === 'open' && tab.selected,
      kind: tab.kind,
    };
  }
  return {
    libraryIDs() {
      requireActive();
      const ids = new Set<number>();
      for (const group of groups)
        for (const member of group.members) ids.add(member.document.libraryID);
      return [...ids];
    },
    registerHost(host) {
      requireActive();
      if (hosts.has(host.native.id)) throw new Error(`Duplicate tab host: ${host.native.id}`);
      const registration: Registration = {
        host,
        active: true,
        cleanup: () => {},
        observed: new Set(host.native.snapshot().map((tab) => tab.viewID)),
        opening: new Set(),
        closedGroups: new Map(),
        closed: new Set(),
      };
      hosts.set(host.native.id, registration);
      try {
        registration.cleanup = host.native.observe(() => {
          if (!registration.active || disposed) return;
          const current = new Set(host.native.snapshot().map((tab) => tab.viewID));
          const closed = [...registration.observed].filter((id) => !current.has(id));
          for (const id of closed) if (registration.opening.has(id)) registration.closed.add(id);
          const removed = new Set(closed.filter((id) => findMember(id) && !live(id)));
          if (removed.size) {
            commit((draft) => {
              for (const group of draft)
                group.members = group.members.filter((member) => !removed.has(member.id));
            });
          }
          registration.observed = current;
          if (!removed.size && !mutatingNative) notify();
        });
      } catch (error) {
        hosts.delete(host.native.id);
        throw error;
      }
      notify();
      return () => {
        if (!registration.active) return;
        registration.active = false;
        hosts.delete(host.native.id);
        registration.cleanup();
        if (!disposed) notify();
      };
    },
    refresh(hostID) {
      getHost(hostID);
      notify();
    },
    subscribe(listener) {
      requireActive();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    view(hostID, titleFormat) {
      const registration = getHost(hostID);
      const tabs = registration.host.native.snapshot();
      const grouped = new Set(groups.flatMap((group) => group.members.map((member) => member.id)));
      const library = tabs.find((tab) => tab.kind === 'library');
      return {
        library: library ? entry(library, 'open', titleFormat) : null,
        groups: groups.map((group) => ({
          id: group.id,
          name: group.name,
          color: group.color,
          collapsed: group.collapsed,
          entries: group.members.flatMap((member) => {
            const open = live(member.id);
            return open
              ? [
                  entry(
                    open.tab,
                    open.registration === registration ? 'open' : 'other-window',
                    titleFormat,
                    member.title,
                  ),
                ]
              : [];
          }),
        })),
        ungrouped: tabs
          .filter((tab) => tab.kind !== 'library' && !grouped.has(tab.viewID))
          .map((tab) => entry(tab, 'open', titleFormat)),
      };
    },
    createGroup(name) {
      if (!validString(name)) throw new Error('Group name is required');
      const id = options.createID();
      commit((draft) => {
        if (!validString(id) || draft.some((group) => group.id === id))
          throw new Error('Invalid group ID');
        draft.push({ id, name: name.trim(), color: '', collapsed: false, members: [] });
      });
      return id;
    },
    async importDocuments(destination, documents, hostID, isCurrent) {
      const registration = getHost(hostID);
      if ('name' in destination && !validString(destination.name))
        throw new Error('Group name is required');
      if ('groupID' in destination) getGroup(destination.groupID);
      let groupID = 'groupID' in destination ? destination.groupID : undefined;
      const closeEpoch = groupID ? (registration.closedGroups.get(groupID) ?? 0) : 0;
      const current = () =>
        !disposed &&
        registration.active &&
        hosts.get(hostID) === registration &&
        isCurrent() &&
        (!groupID ||
          (groups.some((group) => group.id === groupID) &&
            (registration.closedGroups.get(groupID) ?? 0) === closeEpoch));
      let count = 0;
      const keys = new Set<string>();
      for (const item of documents) {
        if (!current()) break;
        const key = `${item.document.kind}:${item.document.libraryID}:${item.document.key}`;
        if (keys.has(key)) continue;
        keys.add(key);
        const viewID = options.createID();
        registration.opening.add(viewID);
        let wasClosed = false;
        let nativeID: string | false;
        try {
          nativeID = await registration.host.native.open(item.document, viewID, current);
        } finally {
          registration.opening.delete(viewID);
          wasClosed = registration.closed.delete(viewID);
        }
        if (!nativeID) continue;
        if (!current() || wasClosed) {
          if (registration.active && !wasClosed) registration.host.native.close([nativeID]);
          break;
        }
        try {
          const newGroupID = groupID ?? options.createID();
          commit((draft) => {
            if (!groupID && 'name' in destination) {
              draft.push({
                id: newGroupID,
                name: destination.name.trim(),
                color: '',
                collapsed: false,
                members: [],
              });
            }
            getGroup(newGroupID, draft).members.push({
              id: viewID,
              document: { ...item.document },
              title: item.title,
            });
          });
          groupID = newGroupID;
          if (findMember(viewID)) count++;
        } catch (error) {
          if (registration.active && !wasClosed) registration.host.native.close([nativeID]);
          throw error;
        }
      }
      return count;
    },
    renameGroup(id, name) {
      if (!validString(name)) throw new Error('Group name is required');
      commit((draft) => {
        getGroup(id, draft).name = name.trim();
      });
    },
    setGroupColor(id, color) {
      if (!validColor(color)) throw new Error('Invalid group color');
      commit((draft) => {
        getGroup(id, draft).color = color;
      });
    },
    toggleGroup(id) {
      commit((draft) => {
        const group = getGroup(id, draft);
        group.collapsed = !group.collapsed;
      });
    },
    assign(memberID, groupID, hostID, beforeMemberID) {
      const registration = getHost(hostID);
      const existing = findMember(memberID);
      const open = live(memberID);
      const document: TabDocumentRef | null | undefined =
        existing?.member.document ?? open?.tab.document;
      if (!document || !open) throw new Error('Only open reader and note views can be grouped');
      const member = existing?.member ?? {
        id: memberID,
        document,
        title: open!.tab.fields.nativeTitle,
      };
      commit(
        (draft) => {
          const target = getGroup(groupID, draft);
          if (beforeMemberID === memberID && findMember(memberID, draft)?.group.id === groupID)
            return;
          const old = findMember(memberID, draft);
          if (old) old.group.members.splice(old.group.members.indexOf(old.member), 1);
          target.members.splice(indexBefore(target.members, beforeMemberID), 0, member);
        },
        { registration, apply: (draft) => reorderNative(registration, draft) },
      );
    },
    removeMember(memberID, hostID) {
      const registration = getHost(hostID);
      commit(
        (draft) => {
          const found = findMember(memberID, draft);
          if (!found) throw new Error('Unknown group member');
          found.group.members.splice(found.group.members.indexOf(found.member), 1);
        },
        { registration, apply: (draft) => reorderNative(registration, draft) },
      );
    },
    moveMember(memberID, groupID, beforeMemberID, hostID) {
      const registration = getHost(hostID);
      if (groupID !== null) {
        const existing = findMember(memberID);
        const open = live(memberID);
        const document = existing?.member.document ?? open?.tab.document;
        if (!document || !open) throw new Error('Only open reader and note views can be grouped');
        const member = existing?.member ?? {
          id: memberID,
          document,
          title: open!.tab.fields.nativeTitle,
        };
        commit(
          (draft) => {
            const target = getGroup(groupID, draft);
            if (beforeMemberID === memberID && findMember(memberID, draft)?.group.id === groupID)
              return;
            const old = findMember(memberID, draft);
            if (old) old.group.members.splice(old.group.members.indexOf(old.member), 1);
            target.members.splice(indexBefore(target.members, beforeMemberID), 0, member);
          },
          { registration, apply: (draft) => reorderNative(registration, draft) },
        );
      } else {
        const tab = registration.host.native
          .snapshot()
          .find(
            (item) => item.viewID === memberID && (item.kind === 'reader' || item.kind === 'note'),
          );
        if (!tab) throw new Error('View is not open in this window');
        const before =
          beforeMemberID === null
            ? null
            : registration.host.native
                .snapshot()
                .find((item) => item.viewID === beforeMemberID && item.kind !== 'library')
                ?.nativeID;
        if (before === undefined) throw new Error('Unknown insertion target');
        commit(
          (draft) => {
            const found = findMember(memberID, draft);
            if (found) found.group.members.splice(found.group.members.indexOf(found.member), 1);
          },
          { registration, apply: () => registration.host.native.move(tab.nativeID, before) },
        );
      }
    },
    moveGroup(groupID, beforeGroupID, hostID) {
      const registration = getHost(hostID);
      commit(
        (draft) => {
          const group = getGroup(groupID, draft);
          if (groupID === beforeGroupID) return;
          draft.splice(draft.indexOf(group), 1);
          draft.splice(indexBefore(draft, beforeGroupID), 0, group);
        },
        { registration, apply: (draft) => reorderNative(registration, draft) },
      );
    },
    ungroup(groupID, hostID) {
      const registration = getHost(hostID);
      commit(
        (draft) => {
          const group = getGroup(groupID, draft);
          draft.splice(draft.indexOf(group), 1);
        },
        { registration, apply: (draft) => reorderNative(registration, draft) },
      );
    },
    async activate(memberID, hostID) {
      const registration = getHost(hostID);
      const open = live(memberID);
      if (open) open.registration.host.activate(open.tab.nativeID);
      else {
        const tab = registration.host.native.snapshot().find((item) => item.viewID === memberID);
        if (tab) registration.host.activate(tab.nativeID);
      }
    },
    closeMember(memberID, hostID) {
      const registration = getHost(hostID);
      const tab = registration.host.native
        .snapshot()
        .find((item) => item.viewID === memberID && item.kind !== 'library');
      if (tab) registration.host.native.close([tab.nativeID]);
    },
    closeGroup(groupID, hostID) {
      const registration = getHost(hostID);
      const group = getGroup(groupID);
      registration.closedGroups.set(groupID, (registration.closedGroups.get(groupID) ?? 0) + 1);
      const ids = new Set(group.members.map((member) => member.id));
      const tabs = registration.host.native
        .snapshot()
        .filter((tab) => ids.has(tab.viewID) && tab.kind !== 'library');
      if (tabs.length) registration.host.native.close(tabs.map((tab) => tab.nativeID));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const registration of hosts.values()) {
        registration.active = false;
        registration.cleanup();
      }
      hosts.clear();
      listeners.clear();
    },
  };
}
