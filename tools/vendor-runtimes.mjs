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
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const selected = process.argv[2] ?? null;
if (
  process.argv.length > 3 ||
  (selected !== null && !['react', 'ai-sdk', 'age-encryption', 'base-ui'].includes(selected))
)
  throw new Error('Usage: node tools/vendor-runtimes.mjs [react|ai-sdk|age-encryption|base-ui]');

const reactDependencies = { react: '19.3.1', 'react-dom': '19.3.1' };
const reactEntry =
  "import * as React from 'react';\nimport * as ReactDOM from 'react-dom';\nimport * as JSXRuntime from 'react/jsx-runtime';\nexport { React, ReactDOM, JSXRuntime };\nexport { createRoot } from 'react-dom/client';\nexport { flushSync } from 'react-dom';\n";
const temp = mkdtempSync(join(tmpdir(), 'neo-runtime-vendor-'));
try {
  const dependencies =
    selected === 'age-encryption'
      ? { 'age-encryption': '0.3.1' }
      : selected === 'base-ui'
        ? { '@base-ui/react': '1.9.0', ...reactDependencies }
        : {
            ai: '7.0.162',
            '@ai-sdk/openai': '4.0.108',
            '@ai-sdk/openai-compatible': '3.0.84',
            zod: '4.2.0',
            ...reactDependencies,
          };
  writeFileSync(
    join(temp, 'package.json'),
    JSON.stringify(
      { name: 'neo-runtime-vendor', private: true, version: '1.0.0', dependencies },
      null,
      2,
    ) + '\n',
  );
  const lockName = selected === 'age-encryption' || selected === 'base-ui' ? selected : 'ai-sdk';
  const existingLock = join(root, 'vendor', lockName, 'package-lock.json');
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
    react: reactEntry,
    'base-ui':
      "export { Menu } from '@base-ui/react/menu';\nexport { Popover } from '@base-ui/react/popover';\nexport { Radio } from '@base-ui/react/radio';\nexport { RadioGroup } from '@base-ui/react/radio-group';\nexport { Checkbox } from '@base-ui/react/checkbox';\n",
    'age-encryption': "export { Encrypter, Decrypter, armor } from 'age-encryption';\n",
  };
  const lock = JSON.parse(readFileSync(join(temp, 'package-lock.json'), 'utf8'));
  for (const [name, source] of Object.entries(entries)) {
    if (selected !== null && selected !== name) continue;
    if (selected === null && (name === 'age-encryption' || name === 'base-ui')) continue;
    const dest = join(root, 'vendor', name);
    mkdirSync(dest, { recursive: true });
    const entry = join(temp, `${name}.mjs`);
    writeFileSync(entry, source);
    writeFileSync(join(dest, 'source.mjs'), source);
    const result = await build({
      ...(name === 'react' || name === 'base-ui' ? { absWorkingDir: temp } : {}),
      entryPoints: [entry],
      outfile: join(dest, 'index.js'),
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'firefox115',
      define: { 'process.env.NODE_ENV': '"production"' },
      legalComments: 'none',
      metafile: true,
      plugins: name === 'base-ui' ? [ownerReactBridge(entry)] : [],
      logLevel: 'silent',
    });
    const packages = new Set();
    const output = Object.values(result.metafile.outputs)[0];
    if (
      name === 'base-ui' &&
      (output.imports.some(({ path }) => path !== '../react/index.js') ||
        Object.keys(output.inputs).some((path) => /node_modules\/react(?:-dom)?\//u.test(path)))
    ) {
      throw new Error('Base UI must use the vendored React owner without bundling another copy');
    }
    for (const [input, contribution] of Object.entries(output.inputs)) {
      if (!contribution.bytesInOutput) continue;
      const match = input.match(/node_modules\/(?:@[^/]+\/)?[^/]+/);
      if (match) packages.add(match[0]);
    }
    // Record even resolved packages that were removed by tree shaking.
    if (name === 'age-encryption' || name === 'base-ui') {
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
    writeFileSync(join(root, 'vendor/react/index.d.ts'), reactEntry);
  }
  if (selected === 'base-ui') {
    const entry = join(temp, 'types.ts');
    const project = join(temp, 'tsconfig.json');
    writeFileSync(entry, entries['base-ui']);
    writeFileSync(
      project,
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          jsx: 'react-jsx',
          skipLibCheck: true,
        },
      }),
    );
    // Generator and ambient types are development tools: do not add them to the runtime lock.
    execFileSync(
      'npm',
      [
        'install',
        '--no-save',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        'dts-bundle-generator@9.5.1',
        '@types/react@19.3.0',
        '@types/react-dom@19.3.0',
        'typescript@5.9.3',
      ],
      { cwd: temp, stdio: 'inherit' },
    );
    execFileSync(
      process.execPath,
      [
        join(temp, 'node_modules/dts-bundle-generator/dist/bin/dts-bundle-generator.js'),
        '--project',
        project,
        '-o',
        join(temp, 'index.d.ts'),
        '--external-inlines',
        '@base-ui/react',
        '@base-ui/utils',
        '@floating-ui/react-dom',
        '@floating-ui/dom',
        '@floating-ui/core',
        '@floating-ui/utils',
        '--',
        entry,
      ],
      { cwd: temp, stdio: 'inherit' },
    );
    copyFileSync(join(temp, 'index.d.ts'), join(root, 'vendor/base-ui/index.d.ts'));
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
// Regenerate the independent locks separately from the AI/React dependency lock.
if (selected === null) {
  for (const name of ['age-encryption', 'base-ui'])
    execFileSync(process.execPath, [resolve(root, 'tools/vendor-runtimes.mjs'), name], {
      cwd: root,
      stdio: 'inherit',
    });
}

/** Bind upstream's React imports to the sibling vendor module, never a second runtime. */
function ownerReactBridge(entry) {
  const require = createRequire(entry);
  const exports = {
    react: 'React',
    'react-dom': 'ReactDOM',
    'react/jsx-runtime': 'JSXRuntime',
  };
  return {
    name: 'owner-react-bridge',
    setup(builder) {
      builder.onResolve({ filter: /^react(?:-dom|\/jsx-runtime)?$/ }, ({ path }) => ({
        path,
        namespace: 'owner-react',
      }));
      builder.onResolve({ filter: /^neo-vendored-react$/ }, () => ({
        path: '../react/index.js',
        external: true,
      }));
      builder.onLoad({ filter: /.*/, namespace: 'owner-react' }, ({ path }) => {
        const names = Object.keys(require(path)).filter((name) => /^[$\w]+$/u.test(name));
        return {
          contents:
            `import { ${exports[path]} as runtime } from 'neo-vendored-react';\n` +
            `export const { ${names.join(', ')} } = runtime;\nexport default runtime;`,
        };
      });
    },
  };
}
