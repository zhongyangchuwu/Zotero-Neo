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
  closedGroups: Map<string, number>;
  closedMembers: Map<string, number>;
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
  if (candidate.version !== 1 || !Array.isArray(candidate.groups))
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
  let mutatingNative = false;
  let disposed = false;
  const hosts = new Map<string, Registration>();
  const listeners = new Set<() => void>();
  const pending = new Map<
    string,
    {
      registration: Registration;
      epoch: number;
      closeEpoch: number;
      promise: Promise<string | false>;
    }
  >();
  const admitted = new Map<string, { registration: Registration; nativeID: string }>();
  const memberEpoch = new Map<string, number>();

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
        .find(
          (item) =>
            item.viewID === id && (item.kind === 'reader' || item.kind === 'note') && item.document,
        );
      if (tab) return { registration, tab };
    }
    return undefined;
  }
  function invalidate(id: string): void {
    memberEpoch.set(id, (memberEpoch.get(id) ?? 0) + 1);
  }
  function commit(
    change: (draft: MutableGroup[]) => void,
    native?: { registration: Registration; apply: (draft: MutableGroup[]) => void },
  ): void {
    requireActive();
    const draft = groups.map((group) => ({ ...group, members: [...group.members] }));
    change(draft);
    const serialized = JSON.stringify({ version: 1, groups: draft });
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
        const accepted = admitted.get(member.id);
        return accepted?.registration === registration ? [accepted.nativeID] : [];
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
  function entry(
    tab: TabViewSnapshot,
    status: TabSidebarEntry['status'],
    format: string,
  ): TabSidebarEntry {
    return {
      id: tab.viewID,
      title: formatTabTitle(format, tab.fields),
      nativeTitle: tab.fields.nativeTitle,
      status,
      selected: status === 'open' && tab.selected,
      kind: tab.kind,
    };
  }
  function openMember(memberID: string, registration: Registration) {
    const existing = pending.get(memberID);
    if (existing) return existing;
    if (admitted.has(memberID)) return undefined;
    const found = findMember(memberID);
    if (!found) return undefined;
    const epoch = memberEpoch.get(memberID) ?? 0;
    const closeEpoch = registration.closedMembers.get(memberID) ?? 0;
    const isCurrent = () =>
      !disposed &&
      registration.active &&
      hosts.get(registration.host.native.id) === registration &&
      (memberEpoch.get(memberID) ?? 0) === epoch &&
      (registration.closedMembers.get(memberID) ?? 0) === closeEpoch &&
      !!findMember(memberID) &&
      !live(memberID) &&
      !admitted.has(memberID);
    const promise = (async () => {
      const nativeID = await registration.host.native.open(
        found.member.document,
        memberID,
        isCurrent,
      );
      if (
        nativeID &&
        registration.active &&
        !disposed &&
        (registration.closedMembers.get(memberID) ?? 0) !== closeEpoch
      ) {
        registration.host.native.close([nativeID]);
        return false;
      }
      if (nativeID && registration.active && !disposed) {
        if (!live(memberID)) admitted.set(memberID, { registration, nativeID });
        if (findMember(memberID)) reorderNative(registration, groups);
      }
      return nativeID;
    })().finally(() => {
      pending.delete(memberID);
      if (!disposed) notify();
    });
    const admission = { registration, epoch, closeEpoch, promise };
    pending.set(memberID, admission);
    return admission;
  }
  return {
    registerHost(host) {
      requireActive();
      if (hosts.has(host.native.id)) throw new Error(`Duplicate tab host: ${host.native.id}`);
      const registration: Registration = {
        host,
        active: true,
        cleanup: () => {},
        closedGroups: new Map(),
        closedMembers: new Map(),
      };
      hosts.set(host.native.id, registration);
      try {
        registration.cleanup = host.native.observe(() => {
          for (const [id, accepted] of admitted) {
            if (
              accepted.registration === registration &&
              host.native.snapshot().some((tab) => tab.viewID === id)
            )
              admitted.delete(id);
          }
          if (registration.active && !disposed && !mutatingNative) notify();
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
        for (const [id, accepted] of admitted)
          if (accepted.registration === registration) admitted.delete(id);
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
          entries: group.members.map((member) => {
            const open = live(member.id);
            if (open)
              return entry(
                open.tab,
                open.registration === registration ? 'open' : 'other-window',
                titleFormat,
              );
            const fields = registration.host.native.metadata(member.document);
            const display =
              fields && !fields.nativeTitle ? { ...fields, nativeTitle: member.title } : fields;
            return {
              id: member.id,
              title: display ? formatTabTitle(titleFormat, display) : member.title,
              nativeTitle: display?.nativeTitle ?? member.title,
              status: fields ? ('closed' as const) : ('missing' as const),
              selected: false,
              kind: member.document.kind,
            };
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
    importDocuments(destination, documents) {
      requireActive();
      if ('name' in destination && !validString(destination.name))
        throw new Error('Group name is required');
      const target = 'groupID' in destination ? getGroup(destination.groupID) : undefined;
      const keys = new Set(
        target?.members.map(
          ({ document }) => `${document.kind}:${document.libraryID}:${document.key}`,
        ),
      );
      const added: SavedTabMember[] = [];
      for (const entry of documents) {
        const key = `${entry.document.kind}:${entry.document.libraryID}:${entry.document.key}`;
        if (keys.has(key)) continue;
        keys.add(key);
        added.push({ id: options.createID(), document: { ...entry.document }, title: entry.title });
      }
      if (!added.length) return 0;
      const groupID = target?.id ?? options.createID();
      commit((draft) => {
        if ('name' in destination) {
          draft.push({
            id: groupID,
            name: destination.name.trim(),
            color: '',
            collapsed: false,
            members: added,
          });
        } else {
          getGroup(destination.groupID, draft).members.push(...added);
        }
      });
      return added.length;
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
      if (!document || (!open && !existing))
        throw new Error('Only reader and note views can be grouped');
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
      invalidate(memberID);
    },
    moveMember(memberID, groupID, beforeMemberID, hostID) {
      const registration = getHost(hostID);
      if (groupID !== null) {
        const existing = findMember(memberID);
        const open = live(memberID);
        const document = existing?.member.document ?? open?.tab.document;
        if (!document) throw new Error('Only reader and note views can be grouped');
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
        invalidate(memberID);
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
      const epoch = memberEpoch.get(memberID) ?? 0;
      const closeEpoch = registration.closedMembers.get(memberID) ?? 0;
      const open = live(memberID);
      const accepted = admitted.get(memberID);
      if (accepted?.registration.active) {
        accepted.registration.host.activate(accepted.nativeID);
        return;
      }
      if (open) {
        open.registration.host.activate(open.tab.nativeID);
        return;
      }
      if (!findMember(memberID)) {
        const tab = registration.host.native.snapshot().find((item) => item.viewID === memberID);
        if (tab) registration.host.activate(tab.nativeID);
        return;
      }
      let admission = openMember(memberID, registration);
      if (!admission) return;
      const owner = admission.registration;
      const ownerActive = owner.active;
      const ownerCloseEpoch = owner.closedMembers.get(memberID) ?? 0;
      const staleAtClick =
        !owner.active || admission.epoch !== epoch || admission.closeEpoch !== ownerCloseEpoch;
      let nativeID = await admission.promise;
      if (
        !registration.active ||
        disposed ||
        (ownerActive && !owner.active) ||
        (owner.closedMembers.get(memberID) ?? 0) !== ownerCloseEpoch ||
        (memberEpoch.get(memberID) ?? 0) !== epoch ||
        (registration.closedMembers.get(memberID) ?? 0) !== closeEpoch ||
        !findMember(memberID)
      )
        return;
      if (!nativeID && staleAtClick) {
        const openNow = live(memberID);
        const acceptedNow = admitted.get(memberID);
        if (acceptedNow?.registration.active) {
          acceptedNow.registration.host.activate(acceptedNow.nativeID);
          return;
        }
        if (openNow) {
          openNow.registration.host.activate(openNow.tab.nativeID);
          return;
        }
        admission = openMember(memberID, registration);
        if (!admission) return;
        nativeID = await admission.promise;
      }
      if (
        nativeID &&
        registration.active &&
        admission.registration.active &&
        !disposed &&
        (memberEpoch.get(memberID) ?? 0) === epoch &&
        (registration.closedMembers.get(memberID) ?? 0) === closeEpoch &&
        (admission.registration.closedMembers.get(memberID) ?? 0) === admission.closeEpoch &&
        !!findMember(memberID)
      )
        admission.registration.host.activate(nativeID);
    },
    closeMember(memberID, hostID) {
      const registration = getHost(hostID);
      registration.closedMembers.set(memberID, (registration.closedMembers.get(memberID) ?? 0) + 1);
      const accepted = admitted.get(memberID);
      if (accepted?.registration === registration) {
        admitted.delete(memberID);
        registration.host.native.close([accepted.nativeID]);
        return;
      }
      const tab = registration.host.native
        .snapshot()
        .find((item) => item.viewID === memberID && item.kind !== 'library');
      if (tab) registration.host.native.close([tab.nativeID]);
    },
    async openGroup(groupID, hostID) {
      const registration = getHost(hostID);
      const members = getGroup(groupID).members.map((member) => ({
        id: member.id,
        closeEpoch: registration.closedMembers.get(member.id) ?? 0,
      }));
      const closeStart = registration.closedGroups.get(groupID) ?? 0;
      for (const { id: memberID, closeEpoch } of members) {
        if (
          disposed ||
          !registration.active ||
          (registration.closedGroups.get(groupID) ?? 0) !== closeStart ||
          !groups.some((group) => group.id === groupID)
        )
          break;
        const saved = findMember(memberID);
        if (
          saved?.group.id === groupID &&
          (registration.closedMembers.get(memberID) ?? 0) === closeEpoch &&
          !live(memberID) &&
          !admitted.has(memberID)
        ) {
          await openMember(memberID, registration)?.promise;
        }
      }
    },
    closeGroup(groupID, hostID) {
      const registration = getHost(hostID);
      const group = getGroup(groupID);
      registration.closedGroups.set(groupID, (registration.closedGroups.get(groupID) ?? 0) + 1);
      const acceptedIDs: string[] = [];
      for (const member of group.members) {
        const accepted = admitted.get(member.id);
        if (accepted?.registration === registration) {
          acceptedIDs.push(accepted.nativeID);
          admitted.delete(member.id);
        }
      }
      const ids = new Set(
        group.members.map((member) => {
          registration.closedMembers.set(
            member.id,
            (registration.closedMembers.get(member.id) ?? 0) + 1,
          );
          return member.id;
        }),
      );
      const tabs = registration.host.native
        .snapshot()
        .filter((tab) => ids.has(tab.viewID) && tab.kind !== 'library');
      if (tabs.length || acceptedIDs.length)
        registration.host.native.close([
          ...new Set([...tabs.map((tab) => tab.nativeID), ...acceptedIDs]),
        ]);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const registration of hosts.values()) {
        registration.active = false;
        registration.cleanup();
      }
      admitted.clear();
      hosts.clear();
      listeners.clear();
    },
  };
}
