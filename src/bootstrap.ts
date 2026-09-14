/* global Zotero, Services, Components */

interface BootstrapContext {
  readonly id: string;
  readonly version: string;
  readonly rootURI: string;
}

interface MainWindowEvent {
  readonly window: _ZoteroTypes.MainWindow;
}

interface BootstrapController {
  init(context: BootstrapContext): void;
  shutdown(): void;
  addToWindow(window: _ZoteroTypes.MainWindow): void;
  removeFromWindow(window: _ZoteroTypes.MainWindow): void;
}

var ZoteroNeo: BootstrapController | undefined;

const APP_START_TS = Date.now();
let LOG_EPOCH = 0;
const LOG_WRITE = 0x02;
const LOG_CREATE = 0x08;
const LOG_APPEND = 0x10;
const LOG_TRUNCATE = 0x20;

function log(message: string): void {
  Zotero.debug(`[ZoteroNeo] ${message}`);
}

function startupLogFile() {
  const directory =
    typeof Zotero.getProfileDirectory === 'function'
      ? Zotero.getProfileDirectory()
      : Services.dirsvc.get('ProfD', Components.interfaces.nsIFile);
  const file = directory.clone();
  file.append('zotero-neo-startup.log');
  return file;
}

function writeLogFile(text: string, flags: number): void {
  const stream = Components.classes['@mozilla.org/network/file-output-stream;1'].createInstance(
    Components.interfaces.nsIFileOutputStream,
  );
  stream.init(startupLogFile(), flags, 0o600, 0);
  stream.write(text, text.length);
  stream.close();
}

function resetLogFile(context: BootstrapContext): void {
  LOG_EPOCH = Date.now();
  try {
    writeLogFile(
      `Zotero Neo diagnostic log\nstarted=${new Date(LOG_EPOCH).toISOString()}\naddon=${context.id} version=${context.version}\nzotero=${Zotero.version || '?'}\n`,
      LOG_WRITE | LOG_CREATE | LOG_TRUNCATE,
    );
  } catch (error) {
    log(`Diagnostic log reset failed: ${String(error)}`);
  }
}

function logFile(message: string): void {
  try {
    if (!LOG_EPOCH) LOG_EPOCH = Date.now();
    const line = `${Date.now() - LOG_EPOCH}ms  ${message}\n`;
    writeLogFile(line, LOG_WRITE | LOG_CREATE | LOG_APPEND);
  } catch {
    // Diagnostics must never block Bootstrap lifecycle execution.
  }
}

async function startup(context: BootstrapContext): Promise<void> {
  const startedAt = Date.now();
  resetLogFile(context);
  log(`startup called at ${startedAt} (app process start +${startedAt - APP_START_TS}ms)`);
  logFile(`startup called (app process +${startedAt - APP_START_TS}ms)`);

  Services.scriptloader.loadSubScript(`${context.rootURI}content/zotero-neo.js`);
  if (!ZoteroNeo) throw new Error('Zotero Neo runtime bundle did not install its controller');

  try {
    ZoteroNeo.init(context);
  } catch (error) {
    log(`Early init failed: ${String(error)}`);
    logFile(`early init FAILED: ${String(error)}`);
  }
  try {
    for (const window of Zotero.getMainWindows()) ZoteroNeo.addToWindow(window);
  } catch (error) {
    log(`Early window injection failed: ${String(error)}`);
    logFile(`early window injection FAILED: ${String(error)}`);
  }

  await Zotero.initializationPromise;
  log(`initializationPromise resolved (startup +${Date.now() - startedAt}ms)`);
  logFile(`initializationPromise resolved (startup +${Date.now() - startedAt}ms)`);

  try {
    ZoteroNeo.init(context);
  } catch (error) {
    log(`Init after initialization failed: ${String(error)}`);
    logFile(`init after initialization FAILED: ${String(error)}`);
  }
  try {
    for (const window of Zotero.getMainWindows()) ZoteroNeo.addToWindow(window);
  } catch (error) {
    log(`Window injection after init failed: ${String(error)}`);
    logFile(`window injection after init FAILED: ${String(error)}`);
  }
}

function onMainWindowLoad(event: MainWindowEvent): void {
  ZoteroNeo?.addToWindow(event.window);
}

function onMainWindowUnload(event: MainWindowEvent): void {
  ZoteroNeo?.removeFromWindow(event.window);
}

function shutdown(): void {
  log('Shutting down');
  ZoteroNeo?.shutdown();
  ZoteroNeo = undefined;
}

function install(): void {
  log('Installed');
}

function uninstall(): void {
  log('Uninstalled');
}
