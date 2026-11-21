import type { MainWindow } from '../../core/contracts';
import type { ItemTargetSet } from '../../core/item-target';
import { reportDiagnosticError, type Logger } from '../../core/logging';
import {
  moveCollectionItems,
  setCollectionMembership,
  writableCollectionItem,
  type CollectionBatchOutcome,
} from '../../operations/item-collections';
import {
  createCollection,
  createCollectionAndAdd,
  deleteCollection,
  moveCollection,
  renameCollection,
} from '../../operations/collections';
import {
  confirmMainCollectionAction,
  mainActiveCollection,
  mainCollectionLibrary,
  mainCollectionRef,
  mainCollectionRefs,
  mainCursorCollection,
  mainLibraryWritable,
  mainTreeFocused,
  prepareMainCollectionItem,
  promptMainCollectionName,
  type MainCollectionRef,
} from '../../toolkit/main';
import type { PickerItem } from '../../main/picker/model';
import { createCollectionCandidateProvider } from './providers/collections';
import { createCollectionItemsProvider } from './providers/items';
import type {
  PickerConfirmationResult,
  PickerContinuation,
  PickerOpenOptions,
  PickerProvider,
} from '../../main/picker/types';
import { t, type AppLanguage } from '../../i18n';
import { batchStatus } from '../../i18n/batch-result';

const compactLayout = { panes: 1, compact: true } as const;

function targetContext(targets: ItemTargetSet, language: AppLanguage): string {
  if (targets.source === 'main') {
    const { origin } = targets.presentation;
    return t(
      `workflow.itemTarget.main.${origin === 'native-selection' ? 'nativeSelection' : origin}`,
      language,
    );
  }
  return t(
    targets.source === 'reader' ? 'workflow.itemTarget.reader' : 'workflow.itemTarget.note',
    language,
  );
}

function targetLabel(targets: ItemTargetSet, count: number, language: AppLanguage): string {
  const context = targetContext(targets, language);
  const countText = String(count);
  if (targets.source === 'main') {
    const outside = String(Math.min(count, Math.max(0, targets.presentation.outsideCurrentList)));
    return t('workflow.itemTarget.main.summary', language)
      .replace('{context}', context)
      .replace('{count}', countText)
      .replace('{outside}', outside);
  }
  return t('workflow.itemTarget.context.summary', language)
    .replace('{context}', context)
    .replace('{count}', countText);
}

export interface CollectionTargetRequest {
  readonly source: 'main' | 'reader';
  readonly resolveTargets: () => ItemTargetSet;
  readonly label: 'Selection' | 'context item';
}

export type CollectionConfirmation<T = PickerItem> = (
  candidate: T,
  isCurrent: () => boolean,
  query: string,
) => PickerConfirmationResult | Promise<PickerConfirmationResult>;

export type CollectionPickerOptions = Pick<PickerOpenOptions, 'layout' | 'multiSelect'> & {
  readonly confirmMany?: CollectionConfirmation<readonly PickerItem[]>;
};

export interface CollectionActionHost {
  readonly window: MainWindow;
  readonly logger: Logger;
  readonly language: () => AppLanguage;
  readonly isCurrent: () => boolean;
  readonly status: (message: string) => void;
  readonly navigate: (collectionID: number) => Promise<void>;
  readonly choose: (
    source: PickerProvider,
    confirm: CollectionConfirmation,
    options?: CollectionPickerOptions,
  ) => void;
  readonly captureCurrent: () => () => boolean;
}

type MembershipAction = 'collectionAdd' | 'collectionRemove' | 'collectionMove';

class CollectionWorkflowError extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

function membershipMessage(
  action: MembershipAction,
  result: CollectionBatchOutcome,
  missing: number,
  locale: AppLanguage,
): string {
  const summary = batchStatus(
    action,
    missing ? { ...result, unavailable: (result.unavailable ?? 0) + missing } : result,
    locale,
  );
  return result.cacheWarning
    ? `${summary} · ${t('workflow.collections.savedRefreshWarning', locale)}`
    : summary;
}

function membershipInventory(
  items: readonly Zotero.Item[],
  preferredID: number | undefined,
  present: boolean,
  logger: Logger,
): {
  libraryID: number | undefined;
  matching: readonly (readonly number[])[];
  failed: number;
} {
  const groups = new Map<number, { memberships: number[][]; assigned: boolean }>();
  let failed = 0;
  for (const item of items) {
    try {
      const id = item.libraryID;
      if (!mainLibraryWritable(id) || !writableCollectionItem(item, id)) continue;
      const memberships = item.getCollections();
      const group = groups.get(id);
      if (group) {
        group.memberships.push(memberships);
        group.assigned ||= memberships.length > 0;
      } else {
        groups.set(id, { memberships: [memberships], assigned: memberships.length > 0 });
      }
    } catch (error) {
      failed += 1;
      reportDiagnosticError(logger, 'Collection item eligibility could not be read', error);
    }
  }
  const preferred = preferredID === undefined ? undefined : groups.get(preferredID);
  if (preferred && (present || preferred.assigned))
    return { libraryID: preferredID, matching: preferred.memberships, failed };
  if (!present)
    for (const [id, group] of groups)
      if (group.assigned) return { libraryID: id, matching: group.memberships, failed };
  if (preferred) return { libraryID: preferredID, matching: preferred.memberships, failed };
  const first = groups.entries().next();
  if (!first.done)
    return { libraryID: first.value[0], matching: first.value[1].memberships, failed };
  return { libraryID: undefined, matching: [], failed };
}

function scopeTitle(title: string, library: string, locale: AppLanguage): string {
  return t('workflow.collections.membershipScope', locale)
    .replace('{title}', () => title)
    .replace('{library}', () => library);
}

/** Re-resolve only to detect changed intent; never use a new resolution as the write set. */
function checkTargets(initial: ItemTargetSet, current: ItemTargetSet): void {
  const original = new Map(initial.items.map((item) => [item.id, item]));
  const currentIDs = new Set(current.items.map((item) => item.id));
  if (
    current.source !== initial.source ||
    current.presentation?.origin !== initial.presentation?.origin ||
    current.total !== initial.total ||
    current.items.some((item) => original.get(item.id)?.libraryID !== item.libraryID) ||
    initial.items.some(
      (item) => !currentIDs.has(item.id) && Zotero.Items.get(item.id) === item && !item.deleted,
    )
  )
    throw new CollectionWorkflowError('selectionChanged');
}

function writable(libraryID: number): void {
  if (!mainLibraryWritable(libraryID)) throw new CollectionWorkflowError('libraryUnavailable');
}

function currentCollection(id: number, libraryID: number): MainCollectionRef {
  const collection = mainCollectionRef(id);
  if (!collection || collection.libraryID !== libraryID)
    throw new CollectionWorkflowError('collectionUnavailable');
  writable(libraryID);
  return collection;
}

function candidateID(candidate: PickerItem, libraryID: number): number {
  const id = Number(candidate.id);
  if (!Number.isInteger(id) || id <= 0) throw new CollectionWorkflowError('chooseCollection');
  return currentCollection(id, libraryID).id;
}

export class CollectionMembershipActions {
  readonly #host: CollectionActionHost;
  #renameDraft: { readonly id: number; readonly name: string } | undefined;

  constructor(host: CollectionActionHost) {
    this.#host = host;
  }

  open(request: CollectionTargetRequest, present: boolean): void {
    const { window } = this.#host;
    const { resolveTargets } = request;
    this.start(() => {
      const resolved = resolveTargets();
      const items = [...resolved.items];
      const initial = { ...resolved, items };
      const locale = this.#host.language();
      const action = present ? 'collectionAdd' : 'collectionRemove';
      const report = (result: CollectionBatchOutcome) =>
        this.#host.status(membershipMessage(action, result, initial.missing, locale));
      const active = mainActiveCollection(window);
      const { libraryID, matching, failed } = membershipInventory(
        items,
        active?.libraryID ?? mainCollectionLibrary(window)?.libraryID,
        present,
        this.#host.logger,
      );
      if (libraryID === undefined) {
        report({ done: 0, unavailable: items.length - failed, failed });
        return;
      }
      const library = Zotero.Libraries.get(libraryID);
      const libraryName = library ? library.name || String(libraryID) : String(libraryID);
      const count = items.length + initial.missing;
      const target = targetLabel(initial, count, locale);
      if (!present && matching.every((ids) => ids.length === 0)) {
        report({
          done: 0,
          unchanged: matching.length,
          unavailable: items.length - matching.length - failed,
          failed,
        });
        return;
      }
      const titleTarget = t(
        count === 1 ? 'workflow.collections.oneTarget' : 'workflow.collections.manyTargets',
        locale,
      ).replace('{count}', String(count));
      const context = targetContext(initial, locale);
      const outside = initial.source === 'main' ? initial.presentation.outsideCurrentList : 0;
      const outsideHint =
        outside > 0
          ? t('workflow.collections.outsideCurrentList', locale).replace(
              '{count}',
              String(Math.min(count, outside)),
            )
          : '';
      const help = scopeTitle(
        outsideHint ? `${outsideHint} · ${context}` : context,
        libraryName,
        locale,
      );
      let memberships = matching;
      const source = createCollectionCandidateProvider(libraryID, {
        title: t(
          present ? 'workflow.collections.addTitle' : 'workflow.collections.removeTitle',
          locale,
        ).replace('{target}', () => titleTarget),
        presentation: 'compact',
        help: { query: help, list: help },
        libraryName,
        language: locale,
        get memberships() {
          return memberships;
        },
        targetCount: count,
        present,
        includeCreate: present,
        preferredID: active?.id,
      });
      let creating = false;
      let originalQuery = '';
      let name = '';
      const confirm: CollectionConfirmation = async (candidate, isCurrent, query) => {
        checkTargets(initial, resolveTargets());
        writable(libraryID);
        if (candidate.collectionCandidate === 'create') {
          originalQuery = query;
          creating = true;
          return {
            keepOpen: true,
            query: '',
            multiSelect: false,
            source: createCollectionCandidateProvider(libraryID, {
              title: scopeTitle(t('picker.chooseCollectionParent', locale), libraryName, locale),
              presentation: 'compact',
              libraryName,
              language: locale,
              includeRoot: true,
            }),
          };
        }
        if (creating) {
          const parentID =
            candidate.collectionCandidate === 'root' ? false : candidateID(candidate, libraryID);
          const parent = parentID ? Zotero.Collections.get(parentID) : undefined;
          const parentPath = parentID
            ? currentCollection(parentID, libraryID).path
            : `${libraryName} / (root)`;
          const input = promptMainCollectionName(window, `New collection · ${parentPath}`, name);
          if (!isCurrent()) throw new CollectionWorkflowError('actionClosed');
          const back = (): PickerContinuation => {
            creating = false;
            return { keepOpen: true, source, query: originalQuery, multiSelect: true };
          };
          if (input === undefined) return back();
          name = input;
          if (!name.trim()) throw new CollectionWorkflowError('nameRequired');
          if (
            !confirmMainCollectionAction(
              window,
              t('workflow.collections.createAndAddConfirmTitle', locale),
              t('workflow.collections.createAndAddConfirmMessage', locale)
                .replace('{name}', () => name)
                .replace('{parent}', () => parentPath)
                .replace('{target}', () => target),
            )
          )
            return back();
          if (!isCurrent()) throw new CollectionWorkflowError('actionClosed');
          checkTargets(initial, resolveTargets());
          if (parentID && Zotero.Collections.get(parentID) !== parent)
            throw new CollectionWorkflowError('collectionUnavailable');
          const result = await createCollectionAndAdd(items, libraryID, name, parentID, isCurrent);
          return this.finishMembership(action, result, initial.missing, locale);
        }
        const id = candidateID(candidate, libraryID);
        const result = await setCollectionMembership(items, id, present, isCurrent);
        return this.finishMembership(action, result, initial.missing, locale);
      };
      this.openPicker(source, confirm, {
        layout: compactLayout,
        multiSelect: true,
        confirmMany: async (candidates, isCurrent) => {
          checkTargets(initial, resolveTargets());
          const result = await this.applyMembershipMany(
            candidates,
            initial,
            libraryID,
            present,
            locale,
            isCurrent,
          );
          if (result?.keepOpen && isCurrent()) {
            const inventory = membershipInventory(items, libraryID, true, this.#host.logger);
            memberships = inventory.libraryID === libraryID ? inventory.matching : [];
          }
          return result;
        },
      });
    });
  }

  find(): void {
    const { window } = this.#host;
    this.start(() => {
      const scope = mainCollectionLibrary(window);
      if (!scope) throw new CollectionWorkflowError('chooseLibrary');
      const language = this.#host.language();
      const source = createCollectionCandidateProvider(scope.libraryID, {
        title: `${t('picker.findCollections', language)} · ${scope.name}`,
        language,
        libraryName: scope.name,
      });
      this.openPicker(source, async (candidate, isCurrent) => {
        const collection = mainCollectionRef(Number(candidate.id));
        if (!collection || collection.libraryID !== scope.libraryID)
          throw new CollectionWorkflowError('collectionUnavailable');
        if (!isCurrent()) throw new CollectionWorkflowError('actionClosed');
        await this.#host.navigate(collection.id);
      });
    });
  }

  addItems(): void {
    const { window } = this.#host;
    this.start(() => {
      const collection = mainActiveCollection(window);
      if (!collection) throw new CollectionWorkflowError('chooseCollection');
      writable(collection.libraryID);
      const original = Zotero.Collections.get(collection.id);
      const language = this.#host.language();
      const source = createCollectionItemsProvider(collection, language);
      this.openPicker(source, async (candidate, isCurrent) => {
        currentCollection(collection.id, collection.libraryID);
        const item = await prepareMainCollectionItem(Number(candidate.id), collection.libraryID);
        if (Zotero.Collections.get(collection.id) !== original)
          throw new CollectionWorkflowError('collectionUnavailable');
        const result = await setCollectionMembership([item], collection.id, true, isCurrent);
        const summary = membershipMessage('collectionAdd', result, 0, this.#host.language());
        return {
          keepOpen: true,
          message: result.done
            ? `${summary} · ${t('picker.collectionItemSaved', language)}`
            : summary,
        };
      });
    });
  }

  moveItems(request: CollectionTargetRequest): void {
    const { window } = this.#host;
    const { resolveTargets } = request;
    this.start(() => {
      const source = mainActiveCollection(window);
      if (!source) throw new CollectionWorkflowError('chooseSource');
      currentCollection(source.id, source.libraryID);
      const originalSource = Zotero.Collections.get(source.id);
      const sourceIsCurrent = () =>
        mainActiveCollection(window)?.id === source.id &&
        Zotero.Collections.get(source.id) === originalSource;
      const resolved = resolveTargets();
      const items = [...resolved.items];
      const initial = { ...resolved, items };
      const locale = this.#host.language();
      const target = targetLabel(initial, items.length + initial.missing, locale);
      const report = (result: CollectionBatchOutcome) =>
        this.#host.status(membershipMessage('collectionMove', result, initial.missing, locale));
      if (!items.length) {
        report({ done: 0 });
        return;
      }
      const library = Zotero.Libraries.get(source.libraryID);
      const libraryName = library
        ? library.name || String(source.libraryID)
        : String(source.libraryID);
      this.openPicker(
        createCollectionCandidateProvider(source.libraryID, {
          title: scopeTitle(
            t('workflow.collections.moveItemsTitle', locale)
              .replace('{target}', () => target)
              .replace('{source}', () => source.path),
            libraryName,
            locale,
          ),
          libraryName,
          language: locale,
          excludeIDs: new Set([source.id]),
        }),
        async (candidate, isCurrent) => {
          checkTargets(initial, resolveTargets());
          if (!sourceIsCurrent()) throw new CollectionWorkflowError('sourceChanged');
          const destination = candidateID(candidate, source.libraryID);
          const result = await moveCollectionItems(
            items,
            source.id,
            destination,
            () => isCurrent() && sourceIsCurrent(),
          );
          return this.finishMembership('collectionMove', result, initial.missing, locale);
        },
      );
    });
  }

  move(): void {
    const { window } = this.#host;
    this.start(() => {
      const preferred = mainTreeFocused(window, 'collections')
        ? mainCursorCollection(window)
        : mainActiveCollection(window);
      const scope = mainCollectionLibrary(window);
      const libraryID = preferred?.libraryID ?? scope?.libraryID;
      if (libraryID === undefined) throw new CollectionWorkflowError('chooseLibrary');
      writable(libraryID);
      const language = this.#host.language();
      const library = Zotero.Libraries.get(libraryID);
      const libraryName = library ? library.name : undefined;
      let moving: { id: number; original: Zotero.Collection } | undefined;
      this.openPicker(
        createCollectionCandidateProvider(libraryID, {
          title: t('picker.moveCollectionSource', language),
          presentation: 'compact',
          libraryName,
          language,
          preferredID: preferred?.id,
        }),
        async (candidate, isCurrent) => {
          if (!moving) {
            const id = candidateID(candidate, libraryID);
            const original = Zotero.Collections.get(id);
            if (!original) throw new CollectionWorkflowError('collectionUnavailable');
            const target = currentCollection(id, libraryID);
            const excluded = new Set([id]);
            const refs = mainCollectionRefs(libraryID);
            let previousSize: number;
            do {
              previousSize = excluded.size;
              for (const ref of refs) {
                if (ref.parentID && excluded.has(ref.parentID)) excluded.add(ref.id);
              }
            } while (excluded.size !== previousSize);
            moving = { id, original };
            return {
              keepOpen: true,
              query: '',
              source: createCollectionCandidateProvider(libraryID, {
                title: `${t('picker.moveCollection', language)} · ${target.path}`,
                presentation: 'compact',
                libraryName,
                language,
                includeRoot: true,
                excludeIDs: excluded,
              }),
            };
          }
          const { id, original } = moving;
          if (Zotero.Collections.get(id) !== original)
            throw new CollectionWorkflowError('collectionUnavailable');
          const target = currentCollection(id, libraryID);
          const parentID =
            candidate.collectionCandidate === 'root' ? false : candidateID(candidate, libraryID);
          await moveCollection(id, parentID, isCurrent);
          this.#host.status(`✓ Moved collection ${target.name}`);
        },
        { layout: compactLayout },
      );
    });
  }

  create(): void {
    const { window } = this.#host;
    this.start(() => {
      const cursor = mainTreeFocused(window, 'collections')
        ? mainCursorCollection(window)
        : undefined;
      const scope = mainCollectionLibrary(window);
      const libraryID = cursor?.libraryID ?? scope?.libraryID;
      if (!libraryID) throw new CollectionWorkflowError('chooseLibrary');
      writable(libraryID);
      let name = '';
      this.openPicker(
        createCollectionCandidateProvider(libraryID, {
          title: t('picker.chooseCollectionParent', this.#host.language()),
          language: this.#host.language(),
          libraryName: scope?.name,
          includeRoot: true,
          preferredID: cursor?.id ?? mainActiveCollection(window)?.id,
        }),
        async (candidate, isCurrent) => {
          const parentID =
            candidate.collectionCandidate === 'root' ? false : candidateID(candidate, libraryID);
          const parentPath = parentID
            ? currentCollection(parentID, libraryID).path
            : `Library ${libraryID} / (root)`;
          const input = promptMainCollectionName(window, `New collection · ${parentPath}`, name);
          if (!isCurrent()) throw new CollectionWorkflowError('actionClosed');
          if (input === undefined) return { keepOpen: true };
          name = input;
          if (!name.trim()) throw new CollectionWorkflowError('nameRequired');
          if (
            !confirmMainCollectionAction(
              window,
              'Create collection',
              `Create “${name}” under ${parentPath}?`,
            )
          )
            return { keepOpen: true };
          if (!isCurrent()) throw new CollectionWorkflowError('actionClosed');
          await createCollection(libraryID, name, parentID, isCurrent);
          this.#host.status(`✓ Created “${name}” under ${parentPath}`);
        },
      );
    });
  }

  rename(): void {
    const { window } = this.#host;
    this.dialogAction(async (target, isCurrent) => {
      const draft = this.#renameDraft;
      const name = promptMainCollectionName(
        window,
        `Rename collection · ${target.path}`,
        draft?.id === target.id ? draft.name : target.name,
      );
      if (name === undefined) {
        this.#renameDraft = undefined;
        return;
      }
      this.#renameDraft = { id: target.id, name };
      if (!name.trim()) throw new CollectionWorkflowError('nameRequired');
      currentCollection(target.id, target.libraryID);
      await renameCollection(target.id, name, isCurrent);
      this.#renameDraft = undefined;
      this.#host.status(`✓ Renamed ${target.path} to “${name}”`);
    });
  }

  removeCollection(): void {
    const { window } = this.#host;
    this.dialogAction(async (target, isCurrent) => {
      if (
        !confirmMainCollectionAction(
          window,
          'Delete collection — keep items',
          `Delete ${target.path} and its subcollections? All items are kept in the library. Neo item undo does not restore collection structure.`,
        )
      )
        return;
      currentCollection(target.id, target.libraryID);
      await deleteCollection(target.id, isCurrent);
      this.#host.status(`✓ Deleted ${target.path}; all items kept`);
    });
  }

  private target(window: MainWindow): MainCollectionRef {
    const target = mainTreeFocused(window, 'collections')
      ? mainCursorCollection(window)
      : mainActiveCollection(window);
    if (!target) throw new CollectionWorkflowError('chooseCollection');
    return currentCollection(target.id, target.libraryID);
  }

  private openPicker(
    source: PickerProvider,
    confirm: CollectionConfirmation,
    options?: CollectionPickerOptions,
  ): void {
    const safeConfirm =
      <T>(callback: CollectionConfirmation<T>): CollectionConfirmation<T> =>
      async (candidate, isCurrent, query) => {
        try {
          const result = await callback(candidate, isCurrent, query);
          if (result?.source) return { ...result, source: this.safeProvider(result.source) };
          return result;
        } catch (error) {
          if (error instanceof CollectionWorkflowError)
            return { keepOpen: true, message: this.failureMessage(error) };
          throw new Error(this.failureMessage(error));
        }
      };
    this.#host.choose(
      this.safeProvider(source),
      safeConfirm(confirm),
      options?.confirmMany
        ? { ...options, confirmMany: safeConfirm(options.confirmMany) }
        : options,
    );
  }

  private safeProvider(source: PickerProvider): PickerProvider {
    const load = async (query?: string) => {
      try {
        return await (query !== undefined && source.query ? source.query(query) : source.load());
      } catch (error) {
        throw new Error(this.failureMessage(error));
      }
    };
    return { ...source, load, query: source.query ? load : undefined };
  }

  private async applyMembershipMany(
    candidates: readonly PickerItem[],
    { items, missing }: ItemTargetSet,
    libraryID: number,
    present: boolean,
    locale: AppLanguage,
    isCurrent: () => boolean,
  ): Promise<PickerConfirmationResult> {
    // Later destinations must still be the same objects when earlier saves finish.
    const targets = candidates.map(({ id: candidateID }) => {
      const id = Number(candidateID);
      return {
        id,
        collection: Number.isInteger(id) && id > 0 && Zotero.Collections.get(id),
      };
    });
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    let incomplete = false;
    let cacheWarning = false;
    for (const { id, collection } of targets) {
      if (!isCurrent()) return;
      skipped += missing;
      try {
        if (!collection || Zotero.Collections.get(id) !== collection)
          throw new CollectionWorkflowError('collectionUnavailable');
        currentCollection(id, libraryID);
        const result = await setCollectionMembership(items, id, present, isCurrent);
        const unavailable = (result.unavailable ?? 0) + (result.missingData ?? 0);
        updated += result.done;
        skipped += unavailable + (result.unchanged ?? 0);
        failed += result.failed ?? 0;
        incomplete ||= !!unavailable || !!result.failed;
        cacheWarning ||= !!result.cacheWarning;
      } catch (error) {
        if (!isCurrent()) return;
        if (error instanceof CollectionWorkflowError) skipped += items.length;
        else {
          reportDiagnosticError(
            this.#host.logger,
            'Collection membership could not be saved',
            error,
          );
          failed += items.length;
        }
        incomplete = true;
      }
    }
    if (!isCurrent()) return;
    const summary = t('workflow.collections.multiMembershipSummary', locale)
      .replace('{collections}', String(targets.length))
      .replace('{updated}', String(updated))
      .replace('{skipped}', String(skipped))
      .replace('{failed}', String(failed));
    const message = cacheWarning
      ? `${summary} · ${t('workflow.collections.savedRefreshWarning', locale)}`
      : summary;
    if (incomplete || missing) return { keepOpen: true, message };
    this.#host.status(`${updated ? '✓' : '→'} ${message}`);
  }

  private finishMembership(
    action: MembershipAction,
    result: CollectionBatchOutcome,
    missing: number,
    locale: AppLanguage,
  ): PickerConfirmationResult {
    const message = membershipMessage(action, result, missing, locale);
    if (!result.done && result.failed) return { keepOpen: true, message };
    this.#host.status(message);
  }

  private dialogAction(
    action: (target: MainCollectionRef, isCurrent: () => boolean) => Promise<void>,
  ): void {
    this.start(() => {
      const target = this.target(this.#host.window);
      const original = Zotero.Collections.get(target.id);
      const isCurrent = this.#host.captureCurrent();
      void action(
        target,
        () => isCurrent() && Zotero.Collections.get(target.id) === original,
      ).catch((error) => this.failure(error));
    });
  }

  private start(action: () => void): void {
    if (!this.#host.isCurrent()) return;
    try {
      action();
    } catch (error) {
      this.failure(error);
    }
  }

  private failure(error: unknown): void {
    this.#host.status(`✗ ${this.failureMessage(error)}`);
  }

  private failureMessage(error: unknown): string {
    if (error instanceof CollectionWorkflowError)
      return t(`workflow.collections.${error.reason}`, this.#host.language());
    reportDiagnosticError(this.#host.logger, 'Collection workflow failed', error);
    return t('workflow.collections.failed', this.#host.language());
  }
}
