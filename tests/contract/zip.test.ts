import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { listZipMembers, zipDirectory } from '../../tools/zip.mjs';

const expectedMembers = [
  'bootstrap.js',
  'content/preferences/pane.js',
  'content/preferences/pane.xhtml',
  'content/zotero-neo.js',
  'icons/icon-128x128.png',
  'icons/icon-16x16.png',
  'icons/icon-256x256.png',
  'icons/icon-32x32.png',
  'icons/icon-48x48.png',
  'icons/icon-64x64.png',
  'icons/icon-96x96.png',
  'manifest.json',
];

function writeFixtureFile(root: string, member: string, contents: string): void {
  const file = join(root, member);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
}

function withTemporaryDirectory(run: (directory: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), 'zotero-neo-zip-'));
  try {
    run(directory);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

describe('ZIP package contract', () => {
  it('writes deterministic bytes and sorted POSIX members regardless of source timestamps', () => {
    withTemporaryDirectory((directory) => {
      const source = join(directory, 'addon');
      for (const [member, contents] of [
        ['manifest.json', '{"version":"1.2.3"}'],
        ['icons/icon-256x256.png', 'largest icon'],
        ['content/zotero-neo.js', 'window.ZoteroNeo = true;'],
        ['icons/icon-64x64.png', 'small icon'],
        ['icons/icon-16x16.png', 'smallest icon'],
        ['icons/icon-96x96.png', 'medium icon'],
        ['content/preferences/pane.xhtml', '<html/>'],
        ['bootstrap.js', 'function startup() {}'],
        ['icons/icon-32x32.png', 'compact icon'],
        ['icons/icon-128x128.png', 'large icon'],
        ['icons/icon-48x48.png', 'toolbar icon'],
        ['content/preferences/pane.js', 'window.Pane = true;'],
      ] as const) {
        writeFixtureFile(source, member, contents);
      }

      const firstArchive = join(directory, 'first.xpi');
      const secondArchive = join(directory, 'second.xpi');
      zipDirectory(source, firstArchive);

      utimesSync(join(source, 'bootstrap.js'), new Date('2001-01-01'), new Date('2001-01-01'));
      utimesSync(
        join(source, 'icons/icon-128x128.png'),
        new Date('2038-01-19'),
        new Date('2038-01-19'),
      );
      zipDirectory(source, secondArchive);

      expect(readFileSync(secondArchive)).toEqual(readFileSync(firstArchive));
      expect(listZipMembers(firstArchive)).toEqual(expectedMembers);
      expect(listZipMembers(firstArchive).every((member) => !member.includes('\\'))).toBe(true);
    });
  });

  it('rejects archives whose central directory cannot be parsed', () => {
    withTemporaryDirectory((directory) => {
      const source = join(directory, 'addon');
      writeFixtureFile(source, 'manifest.json', '{}');
      const archive = join(directory, 'addon.xpi');
      zipDirectory(source, archive);

      const corrupt = readFileSync(archive);
      const centralDirectoryOffset = corrupt.readUInt32LE(corrupt.length - 6);
      corrupt.writeUInt32LE(0, centralDirectoryOffset);
      const corruptArchive = join(directory, 'corrupt.xpi');
      writeFileSync(corruptArchive, corrupt);

      expect(() => listZipMembers(corruptArchive)).toThrow('Invalid central directory entry');
    });
  });
});
