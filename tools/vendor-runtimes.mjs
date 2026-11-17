// Manual regeneration only: npm installs into an isolated temporary directory.
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const selected = process.argv[2] ?? null;
if (
  process.argv.length > 3 ||
  (selected !== null && !['react', 'ai-sdk', 'age-encryption'].includes(selected))
) {
  throw new Error('Usage: node tools/vendor-runtimes.mjs [react|ai-sdk|age-encryption]');
}
const temp = mkdtempSync(join(tmpdir(), 'neo-runtime-vendor-'));
try {
  const dependencies =
    selected === 'age-encryption'
      ? { 'age-encryption': '0.3.1' }
      : {
          ai: '7.0.162',
          '@ai-sdk/openai': '4.0.108',
          '@ai-sdk/openai-compatible': '3.0.84',
          zod: '4.2.0',
          react: '19.3.1',
          'react-dom': '19.3.1',
        };
  writeFileSync(
    join(temp, 'package.json'),
    JSON.stringify(
      { name: 'neo-runtime-vendor', private: true, version: '1.0.0', dependencies },
      null,
      2,
    ) + '\n',
  );
  const existingLock = join(
    root,
    `vendor/${selected === 'age-encryption' ? selected : 'ai-sdk'}/package-lock.json`,
  );
  const hasExistingLock = existsSync(existingLock);
  let lockMatchesDependencies = false;
  if (hasExistingLock) {
    const lockedDependencies =
      JSON.parse(readFileSync(existingLock, 'utf8')).packages?.['']?.dependencies ?? {};
    lockMatchesDependencies =
      Object.keys(lockedDependencies).length === Object.keys(dependencies).length &&
      Object.entries(dependencies).every(([name, version]) => lockedDependencies[name] === version);
    copyFileSync(existingLock, join(temp, 'package-lock.json'));
  }
  execFileSync(
    'npm',
    [lockMatchesDependencies ? 'ci' : 'install', '--ignore-scripts', '--no-audit', '--no-fund'],
    { cwd: temp, stdio: 'inherit' },
  );
  const entries = {
    'ai-sdk':
      "export { generateText, Output, jsonSchema } from 'ai';\nexport { createOpenAI } from '@ai-sdk/openai';\nexport { createOpenAICompatible } from '@ai-sdk/openai-compatible';\n",
    react:
      "import * as React from 'react';\nexport { React };\nexport { createRoot } from 'react-dom/client';\nexport { flushSync } from 'react-dom';\n",
    'age-encryption': "export { Encrypter, Decrypter, armor } from 'age-encryption';\n",
  };
  const lock = JSON.parse(readFileSync(join(temp, 'package-lock.json'), 'utf8'));
  for (const [name, source] of Object.entries(entries)) {
    if (selected !== null && selected !== name) continue;
    if (selected === null && name === 'age-encryption') continue;
    const dest = join(root, 'vendor', name);
    mkdirSync(dest, { recursive: true });
    const entry = join(temp, `${name}.mjs`);
    writeFileSync(entry, source);
    writeFileSync(join(dest, 'source.mjs'), source);
    const result = await build({
      entryPoints: [entry],
      outfile: join(dest, 'index.js'),
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'firefox115',
      define: { 'process.env.NODE_ENV': '"production"' },
      legalComments: 'none',
      metafile: true,
      logLevel: 'silent',
    });
    const packages = new Set();
    const output = Object.values(result.metafile.outputs)[0];
    for (const [input, contribution] of Object.entries(output.inputs)) {
      if (!contribution.bytesInOutput) continue;
      const match = input.match(/node_modules\/(?:@[^/]+\/)?[^/]+/);
      if (match) packages.add(match[0]);
    }
    // Preserve the entire resolved crypto dependency closure, including code
    // removed by tree shaking, rather than only the emitted implementations.
    if (name === 'age-encryption') {
      for (const path of Object.keys(lock.packages)) if (path) packages.add(path);
    }
    const notices = [];
    const closure = {};
    for (const path of [...packages].sort()) {
      const info = lock.packages[path];
      if (!info) throw new Error(`Missing lock record: ${path}`);
      const metadata = JSON.parse(readFileSync(join(temp, path, 'package.json'), 'utf8'));
      if (!['MIT', 'Apache-2.0', 'BSD-3-Clause'].includes(metadata.license))
        throw new Error(`Unexpected license: ${path} ${metadata.license}`);
      let license;
      for (const filename of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE']) {
        try {
          license = readFileSync(join(temp, path, filename), 'utf8');
          break;
        } catch {
          /* try canonical alternatives */
        }
      }
      if (
        !license &&
        metadata.license === 'Apache-2.0' &&
        metadata.repository?.url === 'https://github.com/vercel/ai'
      ) {
        const response = await fetch('https://www.apache.org/licenses/LICENSE-2.0.txt');
        if (!response.ok) throw new Error('Cannot retrieve Apache 2.0 license');
        license = 'Copyright 2023 Vercel, Inc.\n\n' + (await response.text());
      }
      if (!license) throw new Error(`Missing license text: ${path}`);
      closure[path] = {
        version: info.version,
        resolved: info.resolved,
        integrity: info.integrity,
        license: metadata.license,
        repository: metadata.repository,
      };
      if (name === 'age-encryption' && path === 'node_modules/age-encryption') {
        const response = await fetch(`https://registry.npmjs.org/age-encryption/${info.version}`);
        if (!response.ok) throw new Error('Cannot retrieve age source provenance');
        const registry = await response.json();
        if (
          registry.dist?.integrity !== info.integrity ||
          !/^[a-f0-9]{40}$/u.test(registry.gitHead)
        )
          throw new Error('Age source provenance does not match the locked tarball');
        closure[path].sourceCommit = registry.gitHead;
        closure[path].attestations = registry.dist.attestations?.url;
      }
      notices.push(`${path}@${info.version} (${metadata.license})\n\n${license.trim()}\n`);
    }
    writeFileSync(
      join(dest, 'NOTICE'),
      notices.join('\n----------------------------------------------------------------\n\n'),
    );
    writeFileSync(join(dest, 'provenance.json'), JSON.stringify(closure, null, 2) + '\n');
    copyFileSync(join(temp, 'package-lock.json'), join(dest, 'package-lock.json'));
  }
  if (selected === null || selected === 'react') {
    writeFileSync(
      join(root, 'vendor/react/index.d.ts'),
      "import * as React from 'react';\nexport { React };\nexport { createRoot } from 'react-dom/client';\nexport { flushSync } from 'react-dom';\n",
    );
  }
  if (selected === null || selected === 'ai-sdk') {
    writeFileSync(
      join(root, 'vendor/ai-sdk/index.d.ts'),
      'export const generateText: (options: any) => Promise<any>;\nexport const Output: { object(options: any): any };\nexport const jsonSchema: (schema: any) => any;\nexport const createOpenAI: (options: any) => any;\nexport const createOpenAICompatible: (options: any) => (model: string) => any;\n',
    );
  }
  if (selected === 'age-encryption') {
    writeFileSync(
      join(root, 'vendor/age-encryption/index.d.ts'),
      `export interface Stanza { readonly args: readonly string[]; readonly body: Uint8Array; }
export class Encrypter {
  setPassphrase(password: string): void;
  setScryptWorkFactor(logN: number): void;
  encrypt(file: Uint8Array | string): Promise<Uint8Array>;
}
export class Decrypter {
  addIdentity(identity: { unwrapFileKey(stanzas: readonly Stanza[]): Uint8Array | null | Promise<Uint8Array | null> }): void;
  addPassphrase(password: string): void;
  decrypt(file: Uint8Array): Promise<Uint8Array>;
}
export const armor: { encode(file: Uint8Array): string; decode(file: string): Uint8Array };
`,
    );
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
// Keep crypto's closure isolated from UI dependencies and their existing locks.
if (selected === null) {
  execFileSync(process.execPath, [resolve(root, 'tools/vendor-runtimes.mjs'), 'age-encryption'], {
    cwd: root,
    stdio: 'inherit',
  });
}
