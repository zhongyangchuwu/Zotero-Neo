/*
 * Minimal Firefox Remote Debugging Protocol client for Zotero Neo development.
 *
 * Adapted from zotero-plugin-scaffold's RDP client and RemoteFirefox helper,
 * which in turn derive from Mozilla web-ext. Zotero Neo is AGPL-3.0 licensed;
 * this development helper remains under the repository's AGPL-3.0 license.
 *
 * References:
 * - https://github.com/zotero-plugin-dev/zotero-plugin-scaffold
 * - https://github.com/mozilla/web-ext
 */

import net from 'node:net';

const UNSOLICITED_EVENTS = new Set([
  'addonListChanged',
  'frameUpdate',
  'networkEvent',
  'networkEventUpdate',
  'newMutations',
  'propertyChange',
  'styleApplied',
  'tabListChanged',
  'tabNavigated',
]);

function encodeMessage(message) {
  const json = JSON.stringify(message);
  return `${Buffer.byteLength(json)}:${json}`;
}

export class RDPClient {
  #active = new Map();
  #buffer = Buffer.alloc(0);
  #socket = null;

  async connect(port, host = '127.0.0.1', timeoutMs = 1000) {
    await new Promise((resolve, reject) => {
      const socket = net.createConnection({ host, port });
      this.#socket = socket;
      this.#active.set('root', {
        resolve: () => {
          socket.setTimeout(0);
          resolve();
        },
        reject,
      });
      socket.on('data', (data) => this.#onData(data));
      socket.setTimeout(timeoutMs);
      socket.once('error', reject);
      socket.once('timeout', () => {
        socket.destroy();
        reject(new Error(`Timed out connecting to Zotero RDP at ${host}:${port}`));
      });
      socket.once('end', () => this.#rejectAll(new Error('RDP connection ended')));
    });
  }

  disconnect() {
    if (!this.#socket) return;
    this.#socket.removeAllListeners();
    this.#socket.end();
    this.#socket = null;
    this.#rejectAll(new Error('RDP connection closed'));
  }

  async request(request) {
    const message = typeof request === 'string' ? { to: 'root', type: request } : request;
    if (!message.to) throw new Error(`RDP request has no target: ${message.type}`);
    if (!this.#socket) throw new Error('RDP connection is not open');
    if (this.#active.has(message.to)) {
      throw new Error(`RDP actor already has an active request: ${message.to}`);
    }

    return await new Promise((resolve, reject) => {
      this.#active.set(message.to, { resolve, reject });
      this.#socket.write(encodeMessage(message));
    });
  }

  #rejectAll(error) {
    for (const deferred of this.#active.values()) deferred.reject(error);
    this.#active.clear();
  }

  #onData(data) {
    this.#buffer = Buffer.concat([this.#buffer, data]);
    while (this.#readMessage());
  }

  #readMessage() {
    const separator = this.#buffer.indexOf(58);
    if (separator < 1) return false;

    const length = Number.parseInt(this.#buffer.subarray(0, separator).toString(), 10);
    if (!Number.isFinite(length)) {
      this.#rejectAll(new Error('Invalid RDP frame length'));
      return false;
    }
    if (this.#buffer.length - separator - 1 < length) return false;

    const payload = this.#buffer.subarray(separator + 1, separator + 1 + length);
    this.#buffer = this.#buffer.subarray(separator + 1 + length);
    const message = JSON.parse(payload.toString());

    if (message.type && UNSOLICITED_EVENTS.has(message.type)) return true;
    const deferred = this.#active.get(message.from);
    if (!deferred) return true;

    this.#active.delete(message.from);
    if (message.error) deferred.reject(new Error(JSON.stringify(message)));
    else deferred.resolve(message);
    return true;
  }
}

export async function connectRDP(port, attempts = 30, delayMs = 500) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const client = new RDPClient();
    try {
      await client.connect(port);
      return client;
    } catch (error) {
      lastError = error;
      client.disconnect();
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError ?? new Error(`Unable to connect to Zotero RDP on port ${port}`);
}

export async function installTemporaryAddon(client, addonPath) {
  const root = await client.request('getRoot');
  if (!root.addonsActor) throw new Error('Zotero RDP did not expose an addons actor');
  const result = await client.request({
    to: root.addonsActor,
    type: 'installTemporaryAddon',
    addonPath,
  });
  return result.addon;
}

export async function findAddon(client, addonId) {
  const response = await client.request('listAddons');
  return response.addons.find((addon) => addon.id === addonId) ?? null;
}

export async function reloadAddon(client, addonId) {
  const addon = await findAddon(client, addonId);
  if (!addon) throw new Error(`Zotero RDP cannot find add-on: ${addonId}`);
  const requestTypes = await client.request({
    to: addon.actor,
    type: 'requestTypes',
  });
  if (!requestTypes.requestTypes?.includes('reload')) {
    throw new Error('This Zotero build does not expose RDP add-on reload');
  }
  await client.request({ to: addon.actor, type: 'reload' });
  return addon;
}
