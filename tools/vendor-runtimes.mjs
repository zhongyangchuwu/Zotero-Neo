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
const temp = mkdtempSync(join(tmpdir(), 'neo-runtime-vendor-'));
try {
  const dependencies = {
    ai: '7.0.162',
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
  const existingLock = join(root, 'vendor/ai-sdk/package-lock.json');
  if (existsSync(existingLock)) copyFileSync(existingLock, join(temp, 'package-lock.json'));
  execFileSync(
    'npm',
    [existsSync(existingLock) ? 'ci' : 'install', '--ignore-scripts', '--no-audit', '--no-fund'],
    { cwd: temp, stdio: 'inherit' },
  );
  const entries = {
    'ai-sdk':
      "export { generateText, Output, jsonSchema } from 'ai';\nexport { createOpenAICompatible } from '@ai-sdk/openai-compatible';\n",
    react:
      "import * as React from 'react';\nexport { React };\nexport { createRoot } from 'react-dom/client';\n",
  };
  const lock = JSON.parse(readFileSync(join(temp, 'package-lock.json'), 'utf8'));
  for (const [name, source] of Object.entries(entries)) {
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
    const notices = [];
    const closure = {};
    for (const path of [...packages].sort()) {
      const info = lock.packages[path];
      if (!info) throw new Error(`Missing lock record: ${path}`);
      const metadata = JSON.parse(readFileSync(join(temp, path, 'package.json'), 'utf8'));
      if (metadata.license !== 'MIT' && metadata.license !== 'Apache-2.0')
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
      notices.push(`${path}@${info.version} (${metadata.license})\n\n${license.trim()}\n`);
    }
    writeFileSync(
      join(dest, 'NOTICE'),
      notices.join('\n----------------------------------------------------------------\n\n'),
    );
    writeFileSync(join(dest, 'provenance.json'), JSON.stringify(closure, null, 2) + '\n');
    copyFileSync(join(temp, 'package-lock.json'), join(dest, 'package-lock.json'));
  }
  writeFileSync(
    join(root, 'vendor/react/index.d.ts'),
    "import * as React from 'react';\nexport { React };\nexport { createRoot } from 'react-dom/client';\n",
  );
  writeFileSync(
    join(root, 'vendor/ai-sdk/index.d.ts'),
    'export const generateText: (options: any) => Promise<any>;\nexport const Output: { object(options: any): any };\nexport const jsonSchema: (schema: any) => any;\nexport const createOpenAICompatible: (options: any) => (model: string) => any;\n',
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
