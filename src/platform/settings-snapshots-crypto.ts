import { SettingsSnapshotError, type SettingsCryptoContext } from '../settings-snapshots/contracts';
import { assertSettingsCurrent } from '../settings-snapshots/document';
import type {
  SettingsCryptoRequest,
  SettingsCryptoResponse,
} from '../settings-snapshots/crypto-protocol';

const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  'invalid-file': 'This settings file is invalid or unsupported',
  'unsupported-schema': 'This settings file version is not supported',
  'invalid-password': 'A non-empty password is required',
  'resource-limit': 'The settings file exceeds the resource limit',
  'kdf-limit': 'The settings file requires more encryption resources than are supported',
  'crypto-unavailable': 'Secure settings encryption is unavailable in this window',
  'crypto-failed': 'Settings encryption failed, or the password or encrypted file is incorrect',
};
function failure(code: string): SettingsSnapshotError {
  const known = Object.hasOwn(ERROR_MESSAGES, code) ? code : 'crypto-failed';
  return new SettingsSnapshotError(known, ERROR_MESSAGES[known]!);
}
/** Each operation gets a disposable, classic worker in the owning native window.
 * No DOM/crypto constructors are read from the Bootstrap scope. */
export function createSettingsCryptoRunner() {
  let disposed = false;
  let cancelActive: (() => void) | undefined;
  return {
    run(
      request: SettingsCryptoRequest,
      context: SettingsCryptoContext,
    ): Promise<SettingsCryptoResponse> {
      assertSettingsCurrent(context);
      if (disposed)
        return Promise.reject(
          new SettingsSnapshotError('cancelled', 'The settings operation was cancelled'),
        );
      // Bound concurrent scrypt memory and retire superseded jobs immediately.
      cancelActive?.();
      return new Promise((resolve, reject) => {
        let worker: Worker | undefined;
        let timer: number | undefined;
        let settled = false;
        const owner = context.window;
        const finish = (result?: SettingsCryptoResponse, error?: SettingsSnapshotError): void => {
          if (settled) return;
          settled = true;
          context.signal.removeEventListener('abort', cancel);
          owner.removeEventListener('unload', cancel);
          if (timer !== undefined) owner.clearInterval(timer);
          if (worker) {
            worker.onmessage = null;
            worker.onerror = null;
            worker.onmessageerror = null;
            worker.terminate();
          }
          if (cancelActive === cancel) cancelActive = undefined;
          if (error) reject(error);
          else resolve(result!);
        };
        const cancel = (): void =>
          finish(
            undefined,
            new SettingsSnapshotError('cancelled', 'The settings operation was cancelled'),
          );
        cancelActive = cancel;
        context.signal.addEventListener('abort', cancel, { once: true });
        owner.addEventListener('unload', cancel, { once: true });
        try {
          assertSettingsCurrent(context);
          const WorkerConstructor = (owner as Window & { Worker: typeof Worker }).Worker;
          if (typeof WorkerConstructor !== 'function') throw failure('crypto-unavailable');
          // Gecko rejects direct jar: worker URLs from an installed XPI. Use the
          // chrome mapping registered for the same add-on lifetime as native UI.
          worker = new WorkerConstructor(
            'chrome://zotero-neo-ui/content/settings-snapshots-crypto.js',
          );
          worker.onmessage = (event) => {
            try {
              assertSettingsCurrent(context);
              const result = (event as MessageEvent<SettingsCryptoResponse>).data;
              if (!result || typeof result !== 'object' || typeof result.ok !== 'boolean')
                throw failure('crypto-failed');
              if (!result.ok) return finish(undefined, failure(result.code));
              if (result.operation !== request.operation) throw failure('crypto-failed');
              finish(result);
            } catch (error) {
              finish(
                undefined,
                error instanceof SettingsSnapshotError ? error : failure('crypto-failed'),
              );
            }
          };
          worker.onerror = (event) => {
            event.preventDefault();
            finish(undefined, failure('crypto-unavailable'));
          };
          worker.onmessageerror = () => finish(undefined, failure('crypto-failed'));
          // isCurrent is a getter, not an event. Retire stale computation even if
          // its caller has not aborted the signal and the worker is still busy.
          timer = owner.setInterval(() => {
            try {
              assertSettingsCurrent(context);
            } catch {
              cancel();
            }
          }, 50);
          worker.postMessage(request);
        } catch (error) {
          finish(
            undefined,
            error instanceof SettingsSnapshotError ? error : failure('crypto-unavailable'),
          );
        }
      });
    },
    dispose(): void {
      disposed = true;
      cancelActive?.();
    },
  };
}
