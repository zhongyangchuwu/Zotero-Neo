import { CleanupFailure, type Cleanup } from '../../core/cleanup';
import type { MainWindow } from '../../core/contracts';
import { reportDiagnosticError, type Logger } from '../../core/logging';
import { ACTION_LABELS, type ActionId } from '../../input/actions';
import type { BindingContext, BindingMap } from '../../input/bindings';
import type { KeyGuideLanguage } from '../../input/key-guide-config';
import { LocalBindingRuntime } from '../../input/local-binding-runtime';
import { nativeReservation, shortcutsForAction } from '../../input/shortcut-catalog';
import { keyString } from '../../input/keys';
import { serializeBindingTokens } from '../../input/key-sequence';
import {
  bindCompositionState,
  compositionOwnsKey,
  isCommittedInput,
} from '../../input/composition';
import { asElement, isEditableElement } from '../../platform/dom';
import { createExtensionAbortController } from '../../platform/extension-sources';
import { mountNativeReactView } from '../../platform/native-ui';
import type { NativeReactView } from '../../ui/react/types';
import type { ExtensionsReactCommand, ExtensionsReactModel } from './react-model';
import { PLUGINS_INPUT_ACTIONS, PLUGINS_LIST_ACTIONS } from './capabilities';
import { CENTERED_MONOSPACE_OVERLAY_STYLE } from '../../ui/react/shells/main';
import { fuzzyMatchScore } from '../../ui/fuzzy';
import {
  ExtensionSourceWriteError,
  extensionErrorText,
  forgetExtensionSource,
  installExtension,
  updateExtension,
  type ExtensionTransport,
} from './operations';
import { CURATED_EXTENSIONS, resolveExtensionCandidates, type ExtensionCandidate } from './sources';
import {
  installedPlugins,
  openPluginInfoURL,
  openPluginPreferences,
  setPluginEnabled,
  uninstallPlugin,
  ZOTERO_NEO_PLUGIN_ID,
  type InstalledPlugin,
} from './host';
import type {
  ExtensionPanelInline,
  ExtensionPanelOperation,
  PluginManagerRuntime,
} from './runtime';

const H = 'http://www.w3.org/1999/xhtml';
const CURATED_LABELS = CURATED_EXTENSIONS.map(({ label }) => label);

export interface PluginManagerPanelHost {
  readonly window: MainWindow;
  readonly state: PluginManagerRuntime;
  readonly logger: Logger;
  readonly bindings: () => BindingMap;
  readonly themeRoot: (root: HTMLElement) => Cleanup;
  readonly isCurrent: () => boolean;
  readonly language: () => KeyGuideLanguage;
}

export function filterInstalledPlugins(
  plugins: readonly InstalledPlugin[],
  query: string,
): InstalledPlugin[] {
  const needle = query.trim();
  if (!needle) return [...plugins];
  return plugins
    .flatMap((plugin, index) => {
      const search =
        `${plugin.name} ${plugin.id} ${plugin.version} ${plugin.description}`.toLowerCase();
      const score = fuzzyMatchScore(search, needle);
      return score === null ? [] : [{ plugin, index, score }];
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ plugin }) => plugin);
}

export class PluginManagerPanel {
  readonly #host: PluginManagerPanelHost;
  #view: NativeReactView<ExtensionsReactModel> | null = null;

  constructor(host: PluginManagerPanelHost) {
    this.#host = host;
  }

  open(): void {
    if (!this.#host.isCurrent()) return;
    const state = this.#host.state;
    if (state.open) {
      const overlay = state.overlay;
      if (this.isOpenView(overlay)) {
        (state.sourceInput ?? overlay)?.focus();
        return;
      }
      this.close();
      if (!this.#host.isCurrent() || state.open) return;
    }
    const window = this.#host.window;
    let pendingOverlay: HTMLElement | null = null;
    try {
      const doc = window.document;
      const create = (tag: string): HTMLElement => doc.createElementNS(H, tag);
      const overlay = create('div');
      pendingOverlay = overlay;
      overlay.id = 'zv-plugin-manager';
      overlay.tabIndex = -1;
      overlay.style.cssText = CENTERED_MONOSPACE_OVERLAY_STYLE;

      const root = create('div');
      overlay.append(root);
      (doc.body ?? doc.documentElement).append(overlay);

      state.open = true;
      state.loading = true;
      state.error = '';
      state.notice = '';
      state.report = [];
      state.query = '';
      state.selected = 0;
      state.overlay = overlay;
      state.list = null;
      state.details = null;
      state.count = null;
      state.input = null;
      state.footer = null;
      state.previousElement = doc.activeElement;
      const themeCleanup = this.#host.themeRoot(overlay);
      if (state.overlay !== overlay) {
        const failure = new CleanupFailure();
        failure.run(themeCleanup);
        failure.run(() => overlay.remove());
        failure.rethrow();
        return;
      }
      state.themeCleanup = themeCleanup;
      if (!this.#host.isCurrent()) {
        this.close();
        return;
      }
      state.composition = { active: false };
      state.sourceComposition = { active: false };
      state.localBindings = new LocalBindingRuntime({
        bindings: this.#host.bindings,
        execute: (action, event) =>
          this.#host.isCurrent() &&
          state.open &&
          state.overlay === overlay &&
          this.execute(action, event),
        schedule: (callback, delay) => window.setTimeout(callback, delay),
        clearTimer: (timer) => window.clearTimeout(timer),
      });
      const localBindings = state.localBindings;
      const deactivate = (): void => localBindings?.deactivate();
      const current = (): boolean => this.isOpenView(overlay);
      const focus = (): void => {
        if (!current()) return;
        deactivate();
        this.renderFooter();
      };
      const view = mountNativeReactView<ExtensionsReactModel, ExtensionsReactCommand>({
        surface: 'extensions',
        root,
        model: this.model(),
        dispatch: (command) => {
          if (current()) this.dispatch(command);
        },
        isCurrent: current,
        loadingText: this.text('Preparing Plugin Manager…', '正在打开扩展管理器…'),
        errorText: this.text(
          'Could not load Plugin Manager. Press Escape to close.',
          '无法加载扩展管理器，按 Esc 关闭。',
        ),
        onError: (error) =>
          reportDiagnosticError(this.#host.logger, 'Plugin manager renderer failed', error),
      });
      if (!current()) {
        view.dispose();
        return;
      }
      this.#view = view;
      void view.ready.then(
        () => {
          if (!current()) return;
          const input = view.getElement('input') as HTMLInputElement | null;
          const list = view.getElement('list');
          if (!input || !list) return;
          state.input = input;
          state.list = list;
          state.details = view.getElement('details');
          state.count = view.getElement('count');
          state.footer = view.getElement('footer');
          const compositionCleanup = bindCompositionState(input, state.composition);
          const onInput = (event: Event): void => {
            if (!current() || !isCommittedInput(event, state.composition.active)) return;
            state.query = input.value;
            state.selected = 0;
            this.filter();
            this.render();
          };
          input.addEventListener('compositionstart', deactivate);
          overlay.addEventListener('focusout', deactivate);
          input.addEventListener('focus', focus);
          input.addEventListener('input', onInput);
          state.inputCleanup = () => {
            compositionCleanup();
            input.removeEventListener('input', onInput);
            input.removeEventListener('compositionstart', deactivate);
            input.removeEventListener('focus', focus);
            overlay.removeEventListener('focusout', deactivate);
          };
          this.render();
          if (current() && state.inline?.kind === 'source') state.sourceInput?.focus();
        },
        () => undefined,
      );

      overlay.addEventListener('mousedown', (event) => {
        if (current() && event.target === overlay) this.close();
      });

      overlay.focus();
      if (!current()) return;
      this.render();
      if (current()) void this.refresh();
    } catch (error) {
      const failure = new CleanupFailure();
      if (state.overlay === pendingOverlay) failure.run(() => this.close());
      failure.run(() => pendingOverlay?.remove());
      try {
        failure.rethrow();
      } catch (cleanupError) {
        reportDiagnosticError(
          this.#host.logger,
          'Plugin manager open cleanup failed',
          cleanupError,
        );
      }
      reportDiagnosticError(this.#host.logger, 'Plugin manager open failed', error);
      throw error;
    }
  }

  /** Retires the old interaction before releasing resources that may re-enter the module. */
  close(): void {
    const state = this.#host.state;
    if (!state.open) return;
    const generation = ++state.generation;
    const {
      operation,
      localBindings,
      inputCleanup,
      sourceInputCleanup,
      themeCleanup,
      overlay,
      previousElement,
    } = state;
    const view = this.#view;
    this.#view = null;
    state.open = false;
    state.operation = null;
    state.inline = null;
    state.localBindings = null;
    state.inputCleanup = null;
    state.sourceInputCleanup = null;
    state.themeCleanup = null;
    state.previousElement = null;
    state.loading = false;
    state.plugins = [];
    state.filtered = [];
    state.selected = 0;
    state.query = '';
    state.notice = '';
    state.report = [];
    state.error = '';
    state.overlay = null;
    state.list = null;
    state.details = null;
    state.count = null;
    state.input = null;
    state.sourceInput = null;
    state.footer = null;
    const failure = new CleanupFailure();
    failure.run(() => this.abortOperation(operation));
    failure.run(() => localBindings?.dispose());
    failure.run(() => inputCleanup?.());
    failure.run(() => sourceInputCleanup?.());
    failure.run(() => view?.dispose());
    failure.run(() => themeCleanup?.());
    failure.run(() => overlay?.remove());
    try {
      if (
        this.#host.isCurrent() &&
        state.generation === generation &&
        !state.open &&
        overlay?.ownerDocument === this.#host.window.document &&
        previousElement?.isConnected
      )
        (previousElement as HTMLElement).focus();
    } catch {}
    try {
      failure.rethrow();
    } catch (error) {
      reportDiagnosticError(this.#host.logger, 'Plugin manager cleanup failed', error);
      throw error;
    }
  }

  handleKey(event: KeyboardEvent): void {
    const state = this.#host.state;
    const overlay = state.overlay;
    if (!this.isOpenView(overlay)) return;
    const eventTarget = asElement(event.target);
    let target = eventTarget;
    while (
      target &&
      target !== state.input &&
      target !== state.sourceInput &&
      target !== state.overlay &&
      target !== state.list &&
      target !== state.details
    )
      target = target.parentElement;
    if (!target) {
      state.localBindings?.deactivate();
      return;
    }
    const composing =
      (target === state.input && state.composition.active) ||
      (target === state.sourceInput && state.sourceComposition.active);
    if (compositionOwnsKey(event, composing) || event.getModifierState?.('AltGraph')) {
      state.localBindings?.deactivate();
      event.stopPropagation();
      return;
    }
    if (event.key === 'Escape' && event.repeat) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (state.inline) {
      this.handleInlineKey(event, eventTarget);
      return;
    }
    if (
      state.operation?.stoppable &&
      !state.operation.controller.signal.aborted &&
      event.key === 'Escape' &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      !event.shiftKey &&
      target !== state.input
    ) {
      event.preventDefault();
      event.stopPropagation();
      this.stopOperation();
      return;
    }
    if (
      eventTarget?.localName === 'button' ||
      (eventTarget !== state.input && isEditableElement(eventTarget))
    ) {
      state.localBindings?.deactivate();
      event.stopPropagation();
      return;
    }
    const context = target === state.input ? 'plugins-input' : 'plugins-list';
    const key = keyString(event);
    if (key && nativeReservation(context, serializeBindingTokens([key])) === 'exclusive') {
      state.localBindings?.deactivate();
      event.stopPropagation();
      return;
    }
    this.renderFooter(context);
    if (!this.isOpenView(overlay)) return;
    if (state.localBindings?.handle(event, context)) {
      event.preventDefault();
      event.stopImmediatePropagation?.();
    }
    event.stopPropagation();
  }

  private execute(action: ActionId, _event: KeyboardEvent | null): boolean {
    const state = this.#host.state;
    if (!this.isOpenView(state.overlay) || state.inline) return false;
    switch (action) {
      case 'uiFocusList':
        state.overlay?.focus();
        this.renderFooter();
        break;
      case 'uiCancel':
        this.close();
        break;
      case 'uiSearch':
        state.input?.focus();
        state.input?.select();
        break;
      case 'uiNext':
        this.move(1);
        break;
      case 'uiPrevious':
        this.move(-1);
        break;
      case 'uiFirst':
        this.select(0);
        break;
      case 'uiLast':
        this.select(Math.max(0, state.filtered.length - 1));
        break;
      case 'uiPageDown':
        this.move(8);
        break;
      case 'uiPageUp':
        this.move(-8);
        break;
      case 'pluginsRefresh':
        void this.refresh();
        break;
      case 'pluginsInstall':
        this.openInstallSource();
        break;
      case 'pluginsUpdate':
        void this.updateSelectedPlugin();
        break;
      case 'pluginsUpdateAll':
        void this.updateAllPlugins();
        break;
      case 'pluginsUninstall':
        this.openUninstall();
        break;
      case 'pluginsEnable':
        void this.setEnabled(true);
        break;
      case 'pluginsDisable':
        void this.setEnabled(false);
        break;
      case 'pluginsPreferences':
        this.openPreferences();
        break;
      case 'pluginsHomepage':
        this.openInfo('homepage');
        break;
      case 'pluginsReadme':
        this.openInfo('readme');
        break;
      case 'pluginsGitLog':
        this.openInfo('git-log');
        break;
      default:
        return false;
    }
    return true;
  }

  async refresh(): Promise<void> {
    const state = this.#host.state;
    const overlay = state.overlay;
    if (!this.isOpenView(overlay)) return;
    const generation = ++state.generation;
    const current = (): boolean => this.isOpenView(overlay) && state.generation === generation;
    state.loading = true;
    state.error = '';
    this.render();
    if (!current()) return;
    try {
      const plugins = await installedPlugins();
      if (!current()) return;
      const selectedID = state.filtered[state.selected]?.id;
      state.plugins = plugins;
      this.filter();
      const selectedIndex = selectedID
        ? state.filtered.findIndex((plugin) => plugin.id === selectedID)
        : -1;
      state.selected =
        selectedIndex >= 0
          ? selectedIndex
          : Math.min(state.selected, Math.max(0, state.filtered.length - 1));
    } catch (error) {
      if (current()) {
        state.error = this.text('Unable to load plugins.', '无法加载已安装的扩展。');
        reportDiagnosticError(this.#host.logger, 'Plugin manager load failed', error);
      }
    } finally {
      if (current()) {
        state.loading = false;
        this.render();
      }
    }
  }

  private handleInlineKey(event: KeyboardEvent, target: Element | null): void {
    const state = this.#host.state;
    const inline = state.inline;
    state.localBindings?.deactivate();
    event.stopPropagation();
    if (!inline || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!event.repeat) this.dismissInline();
      return;
    }
    if (inline.kind === 'choose' && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      const selected = Math.max(
        0,
        Math.min(
          inline.candidates.length - 1,
          inline.selected + (event.key === 'ArrowDown' ? 1 : -1),
        ),
      );
      state.inline = { ...inline, selected };
      const overlay = state.overlay;
      this.render();
      if (this.isOpenView(overlay) && target?.localName === 'button') overlay?.focus();
      return;
    }
    if (event.key !== 'Enter') return;
    if (!event.repeat && target?.localName === 'button') return; // Native button activation.
    event.preventDefault();
    if (!event.repeat && (target === state.sourceInput || !isEditableElement(target))) {
      this.submitInline();
    }
  }

  private setInline(inline: ExtensionPanelInline | null): void {
    const state = this.#host.state;
    const overlay = state.overlay;
    if (!this.isOpenView(overlay)) return;
    state.localBindings?.deactivate();
    state.inline = inline;
    this.render();
    if (!this.isOpenView(overlay) || state.inline !== inline) return;
    (inline?.kind === 'source' ? (state.sourceInput ?? overlay) : overlay)?.focus();
  }

  private openInstallSource(): void {
    const state = this.#host.state;
    if (state.busy || state.inline) return;
    state.notice = '';
    state.report = [];
    this.setInline({ kind: 'source' });
  }

  private openUninstall(): void {
    const state = this.#host.state;
    const plugin = state.filtered[state.selected];
    if (state.busy || state.loading || state.inline || !plugin) return;
    if (!plugin.canUninstall) {
      state.notice =
        plugin.id === ZOTERO_NEO_PLUGIN_ID
          ? this.text(
              'Zotero Neo cannot uninstall itself.',
              '不能在扩展管理器中卸载 Zotero Neo 自身。',
            )
          : this.text(`${plugin.name} cannot be uninstalled.`, `无法卸载 ${plugin.name}。`);
      this.renderFooter();
      return;
    }
    state.notice = '';
    state.report = [];
    this.setInline({ kind: 'uninstall', plugin });
  }

  private dismissInline(): void {
    const state = this.#host.state;
    const { inline, overlay } = state;
    if (!inline) return;
    if (inline.kind === 'source' && state.busy) this.stopOperation();
    if (this.isOpenView(overlay) && state.inline === inline) this.setInline(null);
  }

  private chooseCandidate(candidates: readonly ExtensionCandidate[], index: number): void {
    if (this.#host.state.busy || !Number.isInteger(index)) return;
    const candidate = candidates[index];
    if (candidate) this.setInline({ kind: 'install', candidate });
  }

  private submitInline(): void {
    const state = this.#host.state;
    const inline = state.inline;
    if (!inline || state.busy) return;
    switch (inline.kind) {
      case 'source': {
        const input = state.sourceInput;
        if (!input || state.sourceComposition.active) return;
        const value = input.value.trim();
        if (!value) {
          const curated = CURATED_EXTENSIONS[0];
          if (curated) this.setInline({ kind: 'install', candidate: curated.candidate });
          return;
        }
        input.focus();
        if (state.inline !== inline) return;
        void this.run(
          this.text('Finding install files…', '正在查找安装文件…'),
          async (transport) => {
            const candidates = await resolveExtensionCandidates(value, transport.signal);
            if (!transport.isCurrent()) return;
            if (!candidates.length) {
              state.notice = this.text('No XPI files found.', '未找到 XPI 文件。');
              return;
            }
            state.notice = '';
            this.setInline(
              candidates.length === 1
                ? { kind: 'install', candidate: candidates[0] }
                : { kind: 'choose', candidates, selected: 0 },
            );
          },
          { stoppable: true },
        );
        return;
      }
      case 'choose':
        this.chooseCandidate(inline.candidates, inline.selected);
        return;
      case 'install':
      case 'uninstall': {
        const overlay = state.overlay;
        this.setInline(null);
        if (!this.isOpenView(overlay) || state.inline) return;
        if (inline.kind === 'install') void this.installCandidate(inline.candidate);
        else void this.uninstallSelectedPlugin(inline.plugin);
      }
    }
  }

  private async installCandidate(candidate: ExtensionCandidate): Promise<void> {
    const state = this.#host.state;
    const name = candidate.name;
    await this.run(
      this.text(`Installing ${name}…`, `正在安装 ${name}…`),
      async (transport, showing) => {
        const result = await installExtension(candidate, transport);
        if (!showing()) return;
        if (result) state.operationNeedsRestart ||= result.pendingRestart;
        if (transport.signal.aborted && !result) return;
        state.notice = result
          ? this.text(`Installed ${name}.`, `已安装 ${name}。`)
          : this.text('Installation cancelled.', '已取消安装。');
      },
      { refresh: true, stoppable: true, name },
    );
  }

  private async uninstallSelectedPlugin(plugin: InstalledPlugin): Promise<void> {
    const state = this.#host.state;
    const { id, name } = plugin;
    await this.run(
      this.text(`Uninstalling ${name}…`, `正在卸载 ${name}…`),
      async (transport) => {
        const result = await uninstallPlugin(id);
        if (transport.isCurrent()) state.operationNeedsRestart ||= result.pendingRestart;
        // Source cleanup belongs to the completed host mutation, even if the UI has closed.
        forgetExtensionSource(id);
        if (transport.isCurrent()) {
          state.notice = this.text(`Uninstalled ${name}.`, `已卸载 ${name}。`);
        }
      },
      { refresh: true },
    );
  }

  private async updateSelectedPlugin(): Promise<void> {
    const state = this.#host.state;
    const plugin = state.filtered[state.selected];
    if (!plugin || state.loading) return;
    const name = plugin.name;
    await this.run(
      this.text(`Checking updates for ${name}…`, `正在检查 ${name} 的更新…`),
      async (transport, showing) => {
        const result = await updateExtension(plugin, transport);
        if (!showing()) return;
        if (result && typeof result === 'object') {
          state.operationNeedsRestart ||= result.pendingRestart;
          state.notice = this.text(`Updated ${name}.`, `已更新 ${name}。`);
        } else if (transport.signal.aborted) {
          return;
        } else if (result === 'current') {
          state.notice = this.text(`No update available for ${name}.`, `${name} 已是最新版本。`);
        } else if (result === 'skipped') {
          state.notice = this.text(
            `${name} has no supported update source.`,
            `${name} 没有受支持的更新来源。`,
          );
        } else {
          state.notice = this.text('Update cancelled.', '已取消更新。');
        }
      },
      { refresh: true, stoppable: true, name },
    );
  }

  private async updateAllPlugins(): Promise<void> {
    const state = this.#host.state;
    if (state.loading || state.busy || state.inline) return;
    const plugins = state.plugins.filter(({ id }) => id !== ZOTERO_NEO_PLUGIN_ID);
    if (!plugins.length) {
      state.notice = this.text('No third-party plugins to update.', '没有可检查更新的第三方扩展。');
      this.renderFooter();
      return;
    }
    await this.run(
      this.text('Checking plugin updates…', '正在检查扩展更新…'),
      async (transport, showing) => {
        const updated: string[] = [];
        const current: string[] = [];
        const skipped: string[] = [];
        const errors: string[] = [];
        let failed = 0;
        for (const [index, plugin] of plugins.entries()) {
          if (!transport.isCurrent()) break;
          const heading = this.text(
            `Checking ${plugin.name} (${index + 1}/${plugins.length})…`,
            `正在检查 ${plugin.name}（${index + 1}/${plugins.length}）…`,
          );
          state.notice = heading;
          this.renderFooter();
          if (!transport.isCurrent()) break;
          try {
            const result = await updateExtension(plugin, {
              ...transport,
              progress: (bytes, total) => {
                if (!transport.isCurrent()) return;
                state.notice = this.text(
                  `Downloading ${plugin.name} (${index + 1}/${plugins.length}): ${bytes}${total > 0 ? ` / ${total}` : ''} bytes`,
                  `正在下载 ${plugin.name}（${index + 1}/${plugins.length}）：${bytes}${total > 0 ? ` / ${total}` : ''} 字节`,
                );
                this.renderFooter();
              },
            });
            if (!showing()) break;
            if (result === 'current') current.push(plugin.name);
            else if (result === 'skipped') skipped.push(plugin.name);
            else if (result) {
              state.operationNeedsRestart ||= result.pendingRestart;
              updated.push(plugin.name);
            } else if (!transport.signal.aborted) {
              failed += 1;
              errors.push(
                this.text(`${plugin.name}: update cancelled.`, `${plugin.name}：已取消更新。`),
              );
            }
          } catch (error) {
            if (!showing()) break;
            if (transport.signal.aborted && !(error instanceof ExtensionSourceWriteError)) break;
            if (error instanceof ExtensionSourceWriteError && error.pendingRestart !== null) {
              updated.push(plugin.name);
              errors.push(`${plugin.name}: ${this.operationError(error)}`);
            } else {
              failed += 1;
              const message = this.operationError(error);
              errors.push(
                this.text(
                  `${plugin.name} failed: ${message}`,
                  `${plugin.name} 更新失败：${message}`,
                ),
              );
            }
          }
        }
        if (!showing()) return;
        const report = [];
        if (updated.length) {
          report.push(this.text(`Updated: ${updated.join(', ')}`, `已更新：${updated.join('、')}`));
        }
        if (current.length) {
          report.push(
            this.text(
              `Already up to date: ${current.join(', ')}`,
              `已是最新版本：${current.join('、')}`,
            ),
          );
        }
        if (skipped.length) {
          report.push(
            this.text(
              `Skipped (no supported update source): ${skipped.join(', ')}`,
              `已跳过（没有受支持的更新来源）：${skipped.join('、')}`,
            ),
          );
        }
        state.report = [...report, ...errors];
        const stopped = transport.signal.aborted;
        state.notice = this.text(
          `${stopped ? 'Update check stopped' : 'Update check finished'}: ${updated.length} updated, ${current.length} current, ${skipped.length} skipped, ${failed} failed.`,
          `${stopped ? '已停止检查更新' : '更新检查已完成'}：${updated.length} 个已更新，${current.length} 个已是最新版本，${skipped.length} 个已跳过，${failed} 个失败。`,
        );
      },
      { refresh: true, stoppable: true },
    );
  }

  private async run(
    notice: string,
    action: (transport: ExtensionTransport, showing: () => boolean) => Promise<void>,
    options: { refresh?: boolean; stoppable?: boolean; name?: string } = {},
  ): Promise<void> {
    const state = this.#host.state;
    const overlay = state.overlay;
    if (!this.isOpenView(overlay) || state.busy) return;
    const buttonFocused = overlay?.ownerDocument.activeElement?.localName === 'button';
    const operation: ExtensionPanelOperation = {
      controller: createExtensionAbortController(),
      cancel: null,
      stoppable: options.stoppable ?? false,
    };
    state.operation = operation;
    state.notice = notice;
    state.report = [];
    const showing = (): boolean => this.isOpenView(overlay) && state.operation === operation;
    const signal = operation.controller.signal;
    const isCurrent = (): boolean => showing() && !signal.aborted;
    const transport: ExtensionTransport = {
      signal,
      isCurrent,
      progress: (bytes, total) => {
        if (!isCurrent() || !options.name) return;
        const count = `${bytes}${total > 0 ? ` / ${total}` : ''}`;
        state.notice = this.text(
          `Downloading ${options.name}: ${count} bytes`,
          `正在下载 ${options.name}：${count} 字节`,
        );
        this.renderFooter();
      },
      registerCancel: (cancel) => {
        if (isCurrent()) operation.cancel = cancel;
        else cancel?.();
      },
    };
    this.render();
    if (buttonFocused && isCurrent()) overlay?.focus();
    try {
      if (isCurrent()) await action(transport, showing);
    } catch (error) {
      if (showing() && (!signal.aborted || error instanceof ExtensionSourceWriteError)) {
        state.notice = this.operationError(error);
      } else if (!signal.aborted || error instanceof ExtensionSourceWriteError) {
        reportDiagnosticError(this.#host.logger, 'Plugin manager operation failed', error);
      }
    } finally {
      if (showing()) {
        if (signal.aborted && state.notice === this.text('Stopping…', '正在停止…')) {
          state.notice = this.text('Operation stopped.', '操作已停止。');
        }
        operation.stoppable = false;
        operation.cancel = null;
        if (options.refresh) await this.refresh();
        if (showing()) {
          state.operation = null;
          this.render();
        }
      }
    }
  }

  private stopOperation(): void {
    const state = this.#host.state;
    const operation = state.operation;
    if (!operation?.stoppable || operation.controller.signal.aborted) return;
    const overlay = state.overlay;
    const buttonFocused = overlay?.ownerDocument.activeElement?.localName === 'button';
    state.notice = this.text('Stopping…', '正在停止…');
    try {
      this.abortOperation(operation);
    } catch (error) {
      reportDiagnosticError(this.#host.logger, 'Plugin manager cancellation failed', error);
    }
    if (!this.isOpenView(overlay) || state.operation !== operation) return;
    this.render();
    if (buttonFocused && this.isOpenView(overlay) && state.operation === operation) {
      (state.sourceInput ?? overlay)?.focus();
    }
  }

  private abortOperation(operation: ExtensionPanelOperation | null): void {
    if (!operation || operation.controller.signal.aborted) return;
    const cancel = operation.cancel;
    operation.cancel = null;
    operation.controller.abort();
    cancel?.();
  }

  private operationError(error: unknown): string {
    if (error instanceof ExtensionSourceWriteError) {
      this.#host.state.operationNeedsRestart ||= error.pendingRestart === true;
    }
    reportDiagnosticError(this.#host.logger, 'Plugin manager operation failed', error);
    return extensionErrorText(error, this.#host.language() === 'zh-CN');
  }

  private async setEnabled(enabled: boolean): Promise<void> {
    const state = this.#host.state;
    const plugin = state.filtered[state.selected];
    if (!plugin || state.busy || state.loading) return;
    const name = plugin.name;
    if (plugin.enabled === enabled) {
      state.notice = enabled
        ? this.text(`${name} is already enabled.`, `${name} 已启用。`)
        : this.text(`${name} is already disabled.`, `${name} 已停用。`);
      this.renderFooter();
      return;
    }
    if (enabled ? !plugin.canEnable : !plugin.canDisable) {
      state.notice =
        !enabled && plugin.id === ZOTERO_NEO_PLUGIN_ID
          ? this.text(
              'Zotero Neo cannot disable itself from inside Plugin Manager.',
              '不能在扩展管理器中停用 Zotero Neo 自身。',
            )
          : enabled
            ? this.text(`${name} cannot be enabled.`, `无法启用 ${name}。`)
            : this.text(`${name} cannot be disabled.`, `无法停用 ${name}。`);
      this.renderFooter();
      return;
    }
    const notice = enabled
      ? this.text(`Enabling ${name}…`, `正在启用 ${name}…`)
      : this.text(`Disabling ${name}…`, `正在停用 ${name}…`);
    await this.run(
      notice,
      async (transport) => {
        await setPluginEnabled(plugin.id, enabled);
        if (transport.isCurrent()) {
          state.notice = enabled
            ? this.text(`Enabled ${name}.`, `已启用 ${name}。`)
            : this.text(`Disabled ${name}.`, `已停用 ${name}。`);
        }
      },
      { refresh: true },
    );
  }

  private openPreferences(): void {
    const state = this.#host.state;
    const plugin = state.filtered[state.selected];
    if (!this.#host.isCurrent() || !state.open || !plugin || state.busy) return;
    if (!plugin.preferencePaneID) {
      state.notice = `${plugin.name} has no registered Zotero settings pane`;
      this.renderFooter();
      return;
    }
    if (!openPluginPreferences(plugin.id)) {
      state.notice = `Unable to open settings for ${plugin.name}`;
      this.renderFooter();
      return;
    }
    state.notice = `Opened settings for ${plugin.name}`;
    this.renderFooter();
  }

  private openInfo(kind: 'homepage' | 'readme' | 'git-log'): void {
    const state = this.#host.state;
    const plugin = state.filtered[state.selected];
    if (!this.#host.isCurrent() || !state.open || !plugin || state.busy) return;

    const target =
      kind === 'homepage'
        ? plugin.homepageURL
        : kind === 'readme'
          ? plugin.readmeURL
          : plugin.gitLogURL;
    const label = kind === 'git-log' ? 'git log' : kind;
    if (!target) {
      state.notice = `${plugin.name} has no ${label} link`;
      this.renderFooter();
      return;
    }
    if (!openPluginInfoURL(target)) {
      state.notice = `Unable to open ${label} for ${plugin.name}`;
      this.renderFooter();
      return;
    }
    state.notice = `Opened ${label} for ${plugin.name}`;
    this.renderFooter();
  }

  private filter(): void {
    const state = this.#host.state;
    state.filtered = filterInstalledPlugins(state.plugins, state.query);
    state.selected = Math.max(0, Math.min(state.selected, Math.max(0, state.filtered.length - 1)));
  }

  private move(amount: number): void {
    const state = this.#host.state;
    if (!state.filtered.length) return;
    this.select(Math.max(0, Math.min(state.filtered.length - 1, state.selected + amount)));
  }

  private select(index: number): void {
    const state = this.#host.state;
    if (!state.filtered.length) {
      state.selected = 0;
      this.render();
      return;
    }
    state.selected = Math.max(0, Math.min(state.filtered.length - 1, index));
    this.render();
  }

  private dispatch(command: ExtensionsReactCommand): void {
    const state = this.#host.state;
    const overlay = state.overlay;
    if (!this.isOpenView(overlay)) return;
    switch (command.type) {
      case 'stop':
        this.stopOperation();
        return;
      case 'action':
        this.execute(command.action, null);
        return;
      case 'inline-submit':
        this.submitInline();
        return;
      case 'inline-dismiss':
        this.dismissInline();
        return;
      case 'choose':
        if (state.inline?.kind === 'choose')
          this.chooseCandidate(state.inline.candidates, command.index);
        return;
      case 'curated': {
        if (state.inline?.kind !== 'source' || state.busy || state.sourceComposition.active) return;
        const curated = Number.isInteger(command.index)
          ? CURATED_EXTENSIONS[command.index]
          : undefined;
        if (curated) this.setInline({ kind: 'install', candidate: curated.candidate });
        return;
      }
      case 'select':
        if (
          state.inline ||
          !Number.isInteger(command.index) ||
          command.index < 0 ||
          command.index >= state.filtered.length
        )
          return;
        state.localBindings?.deactivate();
        state.list?.focus();
        if (this.isOpenView(overlay) && !state.inline) this.select(command.index);
        return;
      case 'link':
        if (state.inline || state.busy) return;
        break;
    }
    const plugin = state.filtered[state.selected];
    if (!plugin) return;
    const url =
      command.kind === 'homepage'
        ? plugin.homepageURL
        : command.kind === 'repository'
          ? plugin.repositoryURL
          : command.kind === 'readme'
            ? plugin.readmeURL
            : command.kind === 'git-log'
              ? plugin.gitLogURL
              : undefined;
    if (url) openPluginInfoURL(url);
  }

  private render(): void {
    const state = this.#host.state;
    const overlay = state.overlay;
    this.#view?.update(this.model());
    if (!this.isOpenView(overlay)) return;
    const input = (this.#view?.getElement('install-input') ?? null) as HTMLInputElement | null;
    if (input !== state.sourceInput) {
      state.sourceInputCleanup?.();
      state.sourceInput = input;
      state.sourceInputCleanup = input
        ? bindCompositionState(input, state.sourceComposition)
        : null;
    }
    if (state.inline?.kind === 'choose') {
      this.#view?.getElement('install-selected')?.scrollIntoView({ block: 'nearest' });
    } else if (!state.inline && !state.loading && !state.error && state.filtered.length) {
      state.list?.children[state.selected]?.scrollIntoView({ block: 'nearest' });
    }
  }

  private model(context?: BindingContext): ExtensionsReactModel {
    const state = this.#host.state;
    const plugin = state.filtered[state.selected];
    const bindings = this.#host.bindings();
    const actions = plugin
      ? [
          this.hint(bindings, 'plugins-list', 'pluginsUpdate'),
          plugin.canUninstall ? this.hint(bindings, 'plugins-list', 'pluginsUninstall') : null,
          !plugin.enabled && plugin.canEnable
            ? this.hint(bindings, 'plugins-list', 'pluginsEnable')
            : null,
          plugin.enabled && plugin.canDisable
            ? this.hint(bindings, 'plugins-list', 'pluginsDisable')
            : null,
          plugin.preferencePaneID
            ? this.hint(bindings, 'plugins-list', 'pluginsPreferences')
            : null,
          plugin.homepageURL ? this.hint(bindings, 'plugins-list', 'pluginsHomepage') : null,
          plugin.readmeURL ? this.hint(bindings, 'plugins-list', 'pluginsReadme') : null,
          plugin.gitLogURL ? this.hint(bindings, 'plugins-list', 'pluginsGitLog') : null,
        ].filter((hint): hint is string => !!hint)
      : [];
    const loading = state.loading && !state.plugins.length;
    const inline = state.inline;
    const enabled = !inline && !state.busy;
    const canChange = enabled && !state.loading;
    let inlineModel: ExtensionsReactModel['inline'] = null;
    switch (inline?.kind) {
      case 'source':
        inlineModel = {
          kind: 'source',
          resolving: state.busy,
          curated: CURATED_LABELS,
        };
        break;
      case 'choose':
        inlineModel = {
          kind: 'choose',
          selected: inline.selected,
          candidates: inline.candidates.map(({ name, version, expectedVersion }) => ({
            name,
            version: version ?? expectedVersion,
          })),
        };
        break;
      case 'install': {
        const { name, url, version, expectedVersion } = inline.candidate;
        inlineModel = { kind: 'install', name, url, version: version ?? expectedVersion };
        break;
      }
      case 'uninstall':
        inlineModel = {
          kind: 'uninstall',
          name: inline.plugin.name,
          version: inline.plugin.version,
        };
        break;
    }
    return {
      chinese: this.#host.language() === 'zh-CN',
      plugins: state.filtered,
      selected: state.selected,
      query: state.query,
      count: state.loading
        ? this.text('Loading…', '正在加载…')
        : `${state.filtered.length}/${state.plugins.length}`,
      listMessage: loading
        ? this.text('Loading installed plugins…', '正在加载已安装的扩展…')
        : state.error
          ? state.error
          : !state.filtered.length
            ? state.query.trim()
              ? this.text('No matching plugins', '没有匹配的扩展')
              : this.text('No installed plugins', '没有已安装的扩展')
            : '',
      listStatus: loading ? 'muted' : state.error ? 'error' : 'normal',
      canStop: state.operation?.stoppable === true && !state.operation.controller.signal.aborted,
      canInstall: enabled,
      canUpdate: canChange && !!plugin,
      canUpdateAll: canChange && state.plugins.some(({ id }) => id !== ZOTERO_NEO_PLUGIN_ID),
      canUninstall: canChange && !!plugin?.canUninstall,
      needsRestart:
        state.operationNeedsRestart || state.plugins.some(({ pendingRestart }) => pendingRestart),
      inline: inlineModel,
      notice: state.notice,
      report: state.report,
      loading: state.loading,
      shortcuts: actions.length
        ? `${this.text('Shortcuts', '快捷键')}\n${actions.join('  ·  ')}`
        : this.text('No additional shortcuts available', '没有其他快捷键'),
      footer: this.footer(bindings, actions, context),
    };
  }

  private renderFooter(context?: BindingContext): void {
    this.#view?.update(this.model(context));
  }

  private footer(
    bindings: BindingMap,
    actions: readonly string[],
    context?: BindingContext,
  ): string {
    const state = this.#host.state;
    if (state.inline) {
      return state.inline.kind === 'choose'
        ? this.text('↑/↓ Select · Enter Continue · Esc Back', '↑/↓ 选择 · Enter 继续 · Esc 返回')
        : this.text('Enter Continue · Esc Back', 'Enter 继续 · Esc 返回');
    }
    const ownedContext =
      context ??
      (this.#host.window.document.activeElement === state.input ? 'plugins-input' : 'plugins-list');
    const navigation =
      ownedContext === 'plugins-input'
        ? PLUGINS_INPUT_ACTIONS
        : PLUGINS_LIST_ACTIONS.filter(
            (action) =>
              !action.startsWith('plugins') ||
              action === 'pluginsRefresh' ||
              action === 'pluginsInstall' ||
              action === 'pluginsUpdateAll',
          );
    const hints = navigation
      .map((action) => this.hint(bindings, ownedContext, action))
      .filter(Boolean);
    const filter = state.query.trim();
    return [
      ...hints,
      ...(ownedContext === 'plugins-list' ? actions : []),
      ...(filter ? [this.text(`filter: ${filter}`, `筛选：${filter}`)] : []),
    ].join(' · ');
  }

  private hint(bindings: BindingMap, context: BindingContext, action: ActionId): string | null {
    const keys = shortcutsForAction(bindings, context, action);
    const language = this.#host.language();
    return keys.length ? `${keys.join('/')} ${ACTION_LABELS[action][language]}` : null;
  }

  private isOpenView(overlay: HTMLElement | null): boolean {
    const state = this.#host.state;
    return (
      this.#host.isCurrent() &&
      state.open &&
      overlay !== null &&
      state.overlay === overlay &&
      overlay.ownerDocument === this.#host.window.document &&
      overlay.isConnected
    );
  }

  private text(english: string, chinese: string): string {
    return this.#host.language() === 'zh-CN' ? chinese : english;
  }
}
