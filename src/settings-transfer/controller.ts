import type { Cleanup } from '../core/cleanup';
import type { KeyGuideLanguage } from '../input/key-guide-config';
import { compositionOwnsKey } from '../input/composition';
import { keyString } from '../input/keys';
import { isDeadObject } from '../platform/cross-compartment';
import { mountNativeReactView } from '../platform/native-ui';
import type {
  SettingsFileChoice,
  SettingsTransferFiles,
} from '../platform/settings-transfer-files';
import type { NativeReactView } from '../ui/react/types';
import { PREPARATION_BACKDROP_STYLE, PREPARATION_PANEL_STYLE } from '../ui/react/shells/reader';
import {
  SettingsTransferError,
  type SettingsCryptoContext,
  type SettingsDocument,
  type SettingsFileCodec,
  type SettingsPlanContext,
  type SettingsRestoreReceipt,
} from './contracts';
import { assertSettingsCurrent, settingStateText } from './document';
import { settingsChangeID, SettingsTransferService, type SettingsTransferPlan } from './service';
import type {
  SettingsTransferCommand,
  SettingsTransferField,
  SettingsTransferModel,
} from './react-model';

export interface SettingsTransferPresentation {
  readonly window: Window;
  readonly language: () => KeyGuideLanguage;
  readonly themeRoot: (root: HTMLElement) => Cleanup;
  readonly isCurrent: () => boolean;
}
export interface SettingsTransferPort {
  open(host: SettingsTransferPresentation): Cleanup | null;
  handleKey(event: KeyboardEvent): boolean;
  closeOwner(window: Window): void;
}
interface TransferView {
  readonly host: SettingsTransferPresentation;
  readonly root: HTMLElement;
  readonly backdrop: HTMLElement;
  readonly focus: HTMLElement | null;
  readonly untheme: Cleanup;
  readonly capture: (event: KeyboardEvent) => void;
  readonly unload: () => void;
  readonly adapters: Set<string>;
  readonly selected: Set<string>;
  readonly paths: Record<string, string>;
  react: NativeReactView<SettingsTransferModel> | null;
  mode: 'export' | 'import';
  includeSecrets: boolean;
  includeLibrarySettings: boolean;
  busy: boolean;
  composition: boolean;
  status: string;
  error: boolean;
  sourcePath: string;
  backup: SettingsFileChoice | null;
  issues: readonly string[];
  receipt?: SettingsRestoreReceipt;
  document?: SettingsDocument;
  plan?: SettingsTransferPlan;
  /** Operation-only business memory; never persisted, rendered, logged or included in commands. */
  password: string;
  abort?: AbortController;
}

/** One application-owned dialog; adapters own semantics and files own ciphertext publication. */
export class SettingsTransferController implements SettingsTransferPort {
  readonly #service: SettingsTransferService;
  readonly #codec: SettingsFileCodec;
  readonly #files: SettingsTransferFiles;
  readonly #debug: (message: string) => void;
  #view: TransferView | null = null;
  constructor(
    service: SettingsTransferService,
    codec: SettingsFileCodec,
    files: SettingsTransferFiles,
    debug: (message: string) => void,
  ) {
    this.#service = service;
    this.#codec = codec;
    this.#files = files;
    this.#debug = debug;
  }
  #text(view: TransferView, cn: string, en: string): string {
    return view.host.language() === 'zh-CN' ? cn : en;
  }
  #current(view: TransferView): boolean {
    return (
      this.#view === view &&
      view.host.isCurrent() &&
      !isDeadObject(view.root) &&
      view.root.isConnected
    );
  }
  open(host: SettingsTransferPresentation): Cleanup | null {
    if (!host.isCurrent()) return null;
    this.close();
    const doc = host.window.document;
    const backdrop = doc.createElementNS('http://www.w3.org/1999/xhtml', 'div') as HTMLElement;
    backdrop.style.cssText = PREPARATION_BACKDROP_STYLE;
    const root = doc.createElementNS('http://www.w3.org/1999/xhtml', 'section') as HTMLElement;
    root.style.cssText = PREPARATION_PANEL_STYLE;
    root.className = 'neo-ui';
    root.dataset.neoSettingsTransfer = '1';
    root.tabIndex = -1;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute(
      'aria-label',
      host.language() === 'zh-CN' ? '配置导出与恢复' : 'Export and restore settings',
    );
    const focus = doc.activeElement as HTMLElement | null;
    backdrop.append(root);
    doc.documentElement.append(backdrop);
    const view: TransferView = {
      host,
      root,
      backdrop,
      focus,
      untheme: host.themeRoot(backdrop),
      capture: (event) => {
        this.handleKey(event);
      },
      unload: () => this.closeOwner(host.window),
      adapters: new Set(this.#service.adapters.map(({ id }) => id)),
      selected: new Set(),
      paths: Object.create(null) as Record<string, string>,
      react: null,
      mode: 'export',
      includeSecrets: false,
      includeLibrarySettings: false,
      busy: false,
      composition: false,
      status: '',
      error: false,
      sourcePath: '',
      backup: null,
      issues: [],
      password: '',
    };
    this.#view = view;
    root.addEventListener('compositionstart', () => {
      view.composition = true;
    });
    root.addEventListener('compositionend', () => {
      view.composition = false;
    });
    host.window.addEventListener('keydown', view.capture, true);
    host.window.addEventListener('unload', view.unload, { once: true });
    view.react = mountNativeReactView<SettingsTransferModel, SettingsTransferCommand>({
      surface: 'settings-transfer',
      root,
      model: this.#model(view),
      isCurrent: () => this.#current(view),
      loadingText: this.#text(view, '正在载入…', 'Loading…'),
      errorText: this.#text(view, '配置迁移界面不可用', 'Settings transfer interface unavailable'),
      onError: () => this.#debug('Settings transfer interface failed'),
      dispatch: (command) => {
        if (this.#current(view)) this.#dispatch(view, command);
      },
    });
    root.focus();
    void view.react.ready
      .then(() => {
        if (this.#current(view) && root.contains(doc.activeElement))
          view.react?.getElement('close')?.focus();
      })
      .catch(() => this.#debug('Settings transfer interface failed'));
    return () => {
      if (this.#view === view) this.close();
    };
  }
  #model(view: TransferView): SettingsTransferModel {
    const groups = new Map<
      string,
      { id: string; label: string; selected: boolean; fields: SettingsTransferField[] }
    >();
    for (const plan of view.plan?.plans ?? [])
      for (const change of plan.changes) {
        const id = settingsChangeID(plan.adapterID, change.key),
          groupID = settingsChangeID(plan.adapterID, change.category);
        let group = groups.get(groupID);
        if (!group) {
          group = {
            id: groupID,
            label: `${plan.adapterID} · ${change.category}`,
            selected: true,
            fields: [],
          };
          groups.set(groupID, group);
        }
        const preview = (state: typeof change.before): string => {
          const value = settingStateText(state, change.secret);
          return value.length > 600 ? `${value.slice(0, 600)}… (${value.length})` : value;
        };
        const selected = view.selected.has(id);
        group.fields.push({
          id,
          label: change.label,
          before: preview(change.before),
          after: preview(change.after),
          selected,
          secret: change.secret,
          requiresRestart: change.requiresRestart,
          blocked: change.blocked,
          canMap: !!change.mapping,
        });
        if (!change.blocked && !selected) group.selected = false;
      }
    return {
      chinese: view.host.language() === 'zh-CN',
      mode: view.mode,
      adapters: this.#service.adapters.map((adapter) => ({
        ...adapter,
        selected: view.adapters.has(adapter.id),
      })),
      includeSecrets: view.includeSecrets,
      includeLibrarySettings: view.includeLibrarySettings,
      busy: view.busy,
      status: view.status,
      error: view.error,
      sourcePath: view.sourcePath,
      backupPath: view.backup?.path ?? '',
      groups: [...groups.values()],
      issues: view.issues,
      receipts:
        view.receipt?.entries.map(
          (entry) =>
            `${entry.adapterID} · ${entry.key}: ${entry.status}${entry.message ? ` — ${entry.message}` : ''}${entry.requiresRestart ? this.#text(view, '（需重启）', ' (restart required)') : ''}`,
        ) ?? [],
      canApply: !!view.plan && !!view.selected.size && !!view.backup,
      selectedCount: view.selected.size,
    };
  }
  #render(view: TransferView): void {
    if (this.#current(view)) view.react?.update(this.#model(view));
  }
  #password(view: TransferView, part: string): string {
    const input = view.react?.getElement(part) as HTMLInputElement | null;
    const value = input?.value ?? '';
    if (input) input.value = '';
    return value;
  }
  #clearReview(view: TransferView): void {
    view.password = '';
    view.document = undefined;
    view.plan = undefined;
    view.selected.clear();
  }
  #setPlan(view: TransferView, plan: SettingsTransferPlan, preserve?: ReadonlySet<string>): void {
    view.plan = plan;
    view.selected.clear();
    for (const adapter of plan.plans)
      for (const change of adapter.changes) {
        const id = settingsChangeID(adapter.adapterID, change.key);
        if (!change.blocked && (preserve ? preserve.has(id) : change.selected))
          view.selected.add(id);
      }
    view.issues = plan.issues.map(
      (issue) => `${issue.adapterID ?? ''}${issue.key ? ` · ${issue.key}` : ''}: ${issue.message}`,
    );
  }
  #run(
    view: TransferView,
    task: (context: SettingsCryptoContext & SettingsPlanContext) => Promise<void>,
  ): void {
    if (view.busy || !this.#current(view)) return;
    const abort = new (view.host.window as Window & typeof globalThis).AbortController();
    view.abort = abort;
    view.busy = true;
    view.error = false;
    const context = {
      window: view.host.window,
      signal: abort.signal,
      isCurrent: () => this.#current(view) && view.abort === abort,
      paths: { ...view.paths },
    };
    this.#render(view);
    void task(context)
      .catch((error: unknown) => {
        if (!this.#current(view)) return;
        view.error = !abort.signal.aborted;
        view.status = abort.signal.aborted
          ? this.#text(
              view,
              '已停止；已接纳的写入不会撤销。重新选择文件以检查当前配置。',
              'Stopped; admitted writes are not rolled back. Select the file again to inspect current settings.',
            )
          : error instanceof SettingsTransferError
            ? error.message
            : this.#text(
                view,
                '配置操作失败；未记录敏感错误信息。',
                'Settings operation failed; sensitive error details were not recorded.',
              );
        if (!(error instanceof SettingsTransferError))
          this.#debug('Settings transfer operation failed');
      })
      .finally(() => {
        if (abort.signal.aborted) this.#clearReview(view);
        if (this.#current(view)) {
          view.busy = false;
          view.abort = undefined;
          this.#render(view);
        }
      });
  }
  #dispatch(view: TransferView, command: SettingsTransferCommand): void {
    if (command.type === 'close') {
      this.close(true);
      return;
    }
    if (command.type === 'stop') {
      view.abort?.abort();
      return;
    }
    if (view.busy) return;
    switch (command.type) {
      case 'mode':
        this.#password(view, 'export-password');
        this.#password(view, 'export-confirm');
        this.#password(view, 'import-password');
        this.#clearReview(view);
        view.mode = command.value;
        view.receipt = undefined;
        view.status = '';
        view.error = false;
        view.issues = [];
        break;
      case 'adapter':
        if (this.#service.adapters.some(({ id }) => id === command.id)) {
          if (command.checked) view.adapters.add(command.id);
          else view.adapters.delete(command.id);
        }
        break;
      case 'include-secrets':
        view.includeSecrets = command.checked;
        break;
      case 'include-library':
        view.includeLibrarySettings = command.checked;
        break;
      case 'field':
      case 'category':
        for (const plan of view.plan?.plans ?? [])
          for (const change of plan.changes) {
            const id = settingsChangeID(plan.adapterID, change.key);
            if (
              !change.blocked &&
              (command.type === 'field'
                ? id === command.id
                : settingsChangeID(plan.adapterID, change.category) === command.id)
            ) {
              if (command.checked) view.selected.add(id);
              else view.selected.delete(id);
            }
          }
        break;
      case 'export': {
        const password = this.#password(view, 'export-password'),
          confirm = this.#password(view, 'export-confirm');
        if (!password || password !== confirm) {
          view.error = true;
          view.status = this.#text(
            view,
            '请输入一致的非空密码。',
            'Enter matching nonempty passwords.',
          );
          break;
        }
        view.status = this.#text(
          view,
          '选择保存位置后生成加密文件；密码派生可能需要片刻（约 256 MiB 内存）。',
          'Choose a destination; password derivation may take a while (about 256 MiB memory).',
        );
        this.#run(view, async (context) => {
          const choice = await this.#files.chooseSave(
            view.host.window,
            `zotero-neo-settings-${new Date().toISOString().slice(0, 10)}.age`,
          );
          assertSettingsCurrent(context);
          if (!choice) {
            view.status = '';
            return;
          }
          const captured = await this.#service.capture(view.adapters, {
            ...context,
            includeSecrets: view.includeSecrets,
            includeLibrarySettings: view.includeLibrarySettings,
          });
          const ciphertext = await this.#codec.seal(captured.document, password, context);
          await this.#files.write(choice, ciphertext, context);
          assertSettingsCurrent(context);
          view.issues = captured.issues.map(
            (issue) =>
              `${issue.adapterID ?? ''}${issue.key ? ` · ${issue.key}` : ''}: ${issue.message}`,
          );
          view.status = this.#text(
            view,
            '加密文件已保存并读回核对。请自行保管文件与密码。',
            'Encrypted file saved and verified by readback. Keep the file and password yourself.',
          );
        });
        return;
      }
      case 'choose-file':
        this.#clearReview(view);
        view.receipt = undefined;
        view.issues = [];
        this.#password(view, 'import-password');
        this.#run(view, async (context) => {
          const path = await this.#files.chooseOpen(view.host.window);
          assertSettingsCurrent(context);
          if (!path) return;
          for (const key of Object.keys(view.paths)) delete view.paths[key];
          view.sourcePath = path;
          view.backup = null;
          view.status = this.#text(
            view,
            '输入文件密码以解密并预览；尚未修改配置。',
            'Enter the file password to decrypt and preview; no settings have been changed.',
          );
        });
        return;
      case 'inspect': {
        const password = this.#password(view, 'import-password');
        if (!view.sourcePath || !password) {
          view.error = true;
          view.status = this.#text(
            view,
            '先选择文件并输入密码。',
            'Choose a file and enter its password first.',
          );
          break;
        }
        this.#clearReview(view);
        view.receipt = undefined;
        view.issues = [];
        view.status = this.#text(
          view,
          '正在完整认证与解密；尚未修改配置…',
          'Authenticating and decrypting the complete file; no settings are changed…',
        );
        this.#run(view, async (context) => {
          const ciphertext = await this.#files.read(view.sourcePath, context);
          const document = await this.#codec.open(ciphertext, password, context);
          const plan = await this.#service.plan(document, context);
          assertSettingsCurrent(context);
          // Each authenticated review gets a fresh destination, not an earlier overwrite grant.
          view.backup = { path: this.#files.backupPath(view.sourcePath), replace: false };
          view.document = document;
          view.password = password;
          this.#setPlan(view, plan);
          view.status = this.#text(
            view,
            '请检查并选择恢复项。秘密不显示，长值预览会截断；写入前必须保存加密备份。',
            'Review and select settings. Secrets are hidden and long previews truncated; an encrypted backup must be saved before any write.',
          );
        });
        return;
      }
      case 'choose-backup':
        this.#run(view, async (context) => {
          const choice = await this.#files.chooseSave(
            view.host.window,
            'zotero-neo-settings-before.age',
          );
          assertSettingsCurrent(context);
          if (choice) view.backup = choice;
        });
        return;
      case 'map': {
        const change = view.plan?.plans
          .flatMap((plan) => plan.changes)
          .find((entry) => settingsChangeID(entry.adapterID, entry.key) === command.id);
        if (!change?.mapping || !view.document) break;
        const document = view.document,
          selected = new Set(view.selected);
        this.#run(view, async (context) => {
          const path = await this.#files.choosePath(view.host.window, change.mapping!.kind);
          assertSettingsCurrent(context);
          if (!path) return;
          view.paths[command.id] = path;
          const plan = await this.#service.plan(document, { ...context, paths: { ...view.paths } });
          assertSettingsCurrent(context);
          this.#setPlan(view, plan, selected);
        });
        return;
      }
      case 'apply': {
        if (!view.plan || !view.password || !view.backup || !view.selected.size) break;
        const plan = view.plan,
          password = view.password,
          backupChoice = view.backup;
        view.status = this.#text(
          view,
          '正在保存加密备份；完成后逐项恢复。停止不会撤销已接纳的写入。',
          'Saving an encrypted backup, then restoring each selected setting. Stop does not roll back admitted writes.',
        );
        this.#run(view, async (context) => {
          const receipt = await this.#service.apply(
            plan,
            new Set(view.selected),
            context,
            async (backup) => {
              const ciphertext = await this.#codec.seal(backup, password, context);
              await this.#files.write(backupChoice, ciphertext, context);
              assertSettingsCurrent(context);
              return backupChoice.path;
            },
          );
          this.#clearReview(view);
          view.receipt = receipt;
          view.error = receipt.entries.some(
            (entry) => entry.status === 'failed' || entry.status === 'conflict',
          );
          view.status = this.#text(
            view,
            receipt.cancelled
              ? '已停止；已接纳的修改保留。请核对逐项回执，备份使用导入文件的相同密码。'
              : view.error
                ? '部分恢复失败；已接纳的修改保留。请核对逐项回执，备份使用导入文件的相同密码。'
                : '恢复操作已完成。请核对逐项回执；需要回退时，以相同密码导入恢复前备份。',
            receipt.cancelled
              ? 'Stopped; admitted changes are retained. Inspect the receipts. The backup uses the import password.'
              : view.error
                ? 'Restore partially failed; admitted changes are retained. Inspect the receipts. The backup uses the import password.'
                : 'Restore completed. Inspect the receipts; import the pre-restore backup with the same password to recover.',
          );
          if (receipt.entries.some((entry) => entry.requiresRestart))
            view.status += this.#text(
              view,
              ' 完全重启 Zotero 后再使用恢复的设置。',
              ' Completely restart Zotero before using the restored settings.',
            );
        });
        return;
      }
    }
    this.#render(view);
  }
  handleKey(event: KeyboardEvent): boolean {
    const view = this.#view,
      target = event.target as Node | null;
    if (
      !view ||
      !this.#current(view) ||
      !target ||
      target.ownerDocument !== view.root.ownerDocument
    )
      return false;
    event.stopImmediatePropagation();
    if (compositionOwnsKey(event, view.composition)) return true;
    const key = keyString(event);
    if (key === 'escape') {
      event.preventDefault();
      this.close(true);
    } else if (!view.root.contains(target)) {
      event.preventDefault();
      view.react?.getElement('close')?.focus();
    } else if (key === 'tab' || key === 'shift+tab') {
      const controls = (
        Array.from(
          view.root.querySelectorAll<HTMLElement>('input,select,textarea,button,summary'),
        ) as HTMLElement[]
      ).filter((element) => !element.matches(':disabled') && element.getClientRects().length);
      if (key === 'tab' && target === controls.at(-1)) {
        event.preventDefault();
        controls[0]?.focus();
      } else if (key === 'shift+tab' && target === controls[0]) {
        event.preventDefault();
        controls.at(-1)?.focus();
      }
    }
    return true;
  }
  closeOwner(window: Window): void {
    if (this.#view?.host.window === window) this.close();
  }
  close(restore = false): void {
    const view = this.#view;
    if (!view) return;
    const ownedFocus = view.root.contains(view.root.ownerDocument.activeElement);
    this.#view = null;
    view.abort?.abort();
    this.#clearReview(view);
    for (const part of ['export-password', 'export-confirm', 'import-password'])
      this.#password(view, part);
    if (!isDeadObject(view.host.window)) {
      view.host.window.removeEventListener('keydown', view.capture, true);
      view.host.window.removeEventListener('unload', view.unload);
    }
    try {
      view.react?.dispose();
    } finally {
      view.untheme();
      if (!isDeadObject(view.backdrop)) view.backdrop.remove();
    }
    if (restore && ownedFocus && view.host.isCurrent() && view.focus?.isConnected)
      view.focus.focus();
  }
  dispose(): void {
    this.close();
    this.#codec.dispose();
  }
}
