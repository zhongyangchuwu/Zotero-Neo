import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import * as age from '../../vendor/age-encryption/index.js';

const root = resolve(import.meta.dirname, '../..');
const vendor = resolve(root, 'vendor/age-encryption');
interface PackageRecord {
  readonly version: string;
  readonly resolved: string;
  readonly integrity: string;
  readonly license: string;
  readonly repository?: { readonly url: string };
  readonly sourceCommit?: string;
  readonly attestations?: string;
}

describe('packaged settings encryption dependency contract', () => {
  it('pins the complete installed closure and retains each upstream license', () => {
    const lock = JSON.parse(readFileSync(resolve(vendor, 'package-lock.json'), 'utf8')) as {
      packages: Record<string, PackageRecord & { dependencies?: Record<string, string> }>;
    };
    const provenance = JSON.parse(
      readFileSync(resolve(vendor, 'provenance.json'), 'utf8'),
    ) as Record<string, PackageRecord>;
    const notice = readFileSync(resolve(vendor, 'NOTICE'), 'utf8');
    expect(lock.packages['']!.dependencies).toEqual({ 'age-encryption': '0.3.1' });
    expect(Object.keys(provenance).sort()).toEqual(
      Object.keys(lock.packages).filter(Boolean).sort(),
    );
    for (const [path, source] of Object.entries(provenance)) {
      const locked = lock.packages[path]!;
      expect(source).toMatchObject({
        version: locked.version,
        resolved: locked.resolved,
        integrity: locked.integrity,
        license: locked.license,
      });
      expect(source.version).toMatch(/^\d+\.\d+\.\d+$/u);
      expect(source.resolved).toMatch(/^https:\/\/registry\.npmjs\.org\//u);
      expect(source.integrity).toMatch(/^sha512-/u);
      expect(source.repository?.url).toMatch(/github\.com\//u);
      expect(notice).toContain(`${path}@${source.version} (${source.license})`);
    }
    expect(provenance['node_modules/age-encryption']).toMatchObject({
      version: '0.3.1',
      license: 'BSD-3-Clause',
      sourceCommit: '38b8b10cb22409de0eaa8a617a01f16dc2e3f9f4',
      attestations: 'https://registry.npmjs.org/-/npm/v1/attestations/age-encryption@0.3.1',
    });
    expect(notice).toContain('Redistribution and use in source and binary forms');
    expect(notice).toContain('Permission is hereby granted, free of charge');
  });

  it('exports the official age encryption, decryption and armor surface, not WebAuthn or key generators', () => {
    expect(Object.keys(age).sort()).toEqual(['Decrypter', 'Encrypter', 'armor']);
  });

  it('bundles as a standalone classic browser worker without runtime packages or dynamic loading', async () => {
    const result = await build({
      entryPoints: [resolve(root, 'src/settings-snapshots/crypto-worker.ts')],
      bundle: true,
      write: false,
      metafile: true,
      platform: 'browser',
      target: 'firefox115',
      format: 'iife',
      minify: true,
    });
    const code = result.outputFiles[0]!.text;
    expect(code).not.toMatch(/^\s*(?:import|export)\s/mu);
    expect(code).not.toMatch(/\b(?:importScripts|eval)\s*\(|\bimport\s*\(/u);
    expect(Object.values(result.metafile!.outputs).flatMap((output) => output.imports)).toEqual([]);
    expect(Object.keys(result.metafile!.inputs)).toContain('vendor/age-encryption/index.js');
    expect(
      Object.keys(result.metafile!.inputs).some((path) => path.includes('node_modules/')),
    ).toBe(false);
  });
});
