#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { build } from 'esbuild';
import { connectRDP } from './dev-rdp-client.mjs';
import { assert, loadCorpus, options, protectOutputs } from './document-quality-common.mjs';

const hash = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
const pathIdentity = (path, os) =>
  os === 'WINNT'
    ? path.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase()
    : path.replace(/\/$/, '');
function hostPath(path, os) {
  if (os !== 'WINNT' || process.platform === 'win32') return path;
  const match = /^\/mnt\/([a-z])\/(.*)$/i.exec(path);
  assert(match, 'Windows Zotero requires PDFs in a Windows-mounted directory');
  return `${match[1].toUpperCase()}:\\${match[2].replace(/\//g, '\\')}`;
}

async function capture() {
  const args = options(
    process.argv.slice(2),
    ['corpus'],
    ['directory', 'profile', 'port', 'output', 'source-root'],
    ['corpus', 'directory', 'profile', 'port', 'output'],
  );
  const port = Number(args.port);
  assert(Number.isInteger(port) && port > 0 && port <= 65535, 'Invalid RDP port');
  const docs = loadCorpus(args.corpus);
  const files = docs.map((doc) => resolve(args.directory, doc.pdf.fileName));
  protectOutputs([...args.corpus, ...files], [args.output]);
  assert(
    !existsSync(args.output),
    'Capture output already exists; preserve it and choose a new run path',
  );
  const sources = docs.map((doc, index) => {
    const bytes = readFileSync(files[index]);
    assert(
      hash(bytes) === doc.pdf.sha256.toLowerCase(),
      `PDF bytes do not match corpus: ${doc.id}`,
    );
    return { doc, file: files[index], md5: hash(bytes, 'md5') };
  });
  const root = resolve(args['source-root'] ?? resolve(import.meta.dirname, '..'));
  const imports = [
    `import { readNativeReaderDocument } from ${JSON.stringify(`${root}/src/reader/document-cache.ts`)};`,
    `import { readReaderReferenceDocument } from ${JSON.stringify(`${root}/src/toolkit/reader/references.ts`)};`,
    `import { documentObjectGroups } from ${JSON.stringify(`${root}/src/document-analysis/object-groups.ts`)};`,
    'Object.assign(globalThis, { NeoQualityCapture: { readNativeReaderDocument, readReaderReferenceDocument, documentObjectGroups } });',
  ].join('\n');
  const bundle = await build({
    stdin: { contents: imports, resolveDir: root, loader: 'ts' },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    target: 'firefox140',
  });
  const code = bundle.outputFiles[0].text;
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  const report = {
    schemaVersion: 1,
    run: {
      id: `native-${Date.now()}`,
      sourceCommit,
      sourceTree: 'working-tree',
      harnessSha256: hash(code),
      host: '',
      startedAt: new Date().toISOString(),
      protocol:
        'cold=first explicit extraction on a fresh imported attachment; warm=second extraction. Import/Reader initialization excluded. Native caches and model initialization may affect timing. Not model-only compute or human task time. No UI completion is inferred.',
    },
    observations: [],
  };
  mkdirSync(dirname(resolve(args.output)), { recursive: true });
  const save = () => writeFileSync(args.output, `${JSON.stringify(report, null, 2)}\n`);
  const client = await connectRDP(port, 1);
  try {
    const descriptor = await client.request({ to: 'root', type: 'getProcess', id: 0 }, 20000);
    const target = (
      await client.request({ to: descriptor.processDescriptor.actor, type: 'getTarget' }, 20000)
    ).process;
    const evaluate = (text) => client.evaluate(target.consoleActor, text);
    const execute = async (body) => {
      const value = await evaluate(`(async()=>{${body}})()`);
      assert(typeof value === 'string', 'Native export did not return JSON');
      const result = JSON.parse(value);
      if (result.error) throw new Error(result.error);
      return result;
    };
    const identity = await execute(
      'globalThis.qualityCapture={window:Services.wm.getMostRecentWindow("navigator:browser")};globalThis.Zotero=qualityCapture.window.Zotero;await Zotero.initializationPromise;return JSON.stringify({profile:Services.dirsvc.get("ProfD",Components.interfaces.nsIFile).path,version:Zotero.version,os:Services.appinfo.OS});',
    );
    assert(
      pathIdentity(identity.profile, identity.os) === pathIdentity(args.profile, identity.os),
      'Connected profile is not the explicitly authorized profile',
    );
    report.run.host = `${identity.os} Zotero ${identity.version}`;
    await evaluate(code);
    save();
    for (const { doc, file, md5 } of sources) {
      const base = {
        documentId: doc.id,
        pdfSha256: doc.pdf.sha256,
        adapterVersion: sourceCommit,
        modelRevision: null,
      };
      let item;
      try {
        item = await execute(
          `try{const item=await Zotero.Attachments.importFromFile({file:${JSON.stringify(hostPath(file, identity.os))},title:${JSON.stringify(`Neo quality: ${doc.title}`)}});return JSON.stringify({id:item.id});}catch(e){return JSON.stringify({error:String(e)});}`,
        );
      } catch (error) {
        for (const backend of ['zotero-sdt', 'zotero-reader'])
          for (const mode of ['cold', 'warm'])
            report.observations.push({
              ...base,
              backend,
              mode,
              status: 'failed',
              failure: `Attachment preparation: ${error}`,
            });
        save();
        continue;
      }
      for (const mode of ['cold', 'warm']) {
        try {
          const result = await execute(
            `try{const start=Date.now();const snapshot=await NeoQualityCapture.readNativeReaderDocument({itemID:${item.id}},()=>true);if(!snapshot)throw Error('Native structure unavailable');if(snapshot.parsed.sourceFingerprint!==${JSON.stringify(md5)})throw Error('Loaded PDF differs from corpus bytes');return JSON.stringify({durationMs:Date.now()-start,parsed:snapshot.parsed,objectGroups:NeoQualityCapture.documentObjectGroups(snapshot.parsed.regions)});}catch(e){return JSON.stringify({error:String(e)});}`,
          );
          report.observations.push({
            ...base,
            backend: 'zotero-sdt',
            mode,
            status: 'completed',
            ...result,
            modelRevision: result.parsed.modelRevision,
          });
        } catch (error) {
          report.observations.push({
            ...base,
            backend: 'zotero-sdt',
            mode,
            status: 'failed',
            failure: String(error),
          });
        }
        save();
      }
      let readerReady = false;
      try {
        await execute(
          `try{qualityCapture.reader=await Zotero.Reader.open(${item.id});await qualityCapture.reader._initPromise;await qualityCapture.reader._internalReader._primaryView.initializedPromise;return JSON.stringify({ready:true});}catch(e){return JSON.stringify({error:String(e)});}`,
        );
        readerReady = true;
        for (const mode of ['cold', 'warm']) {
          try {
            const result = await execute(
              `try{const start=Date.now();const snapshot=await NeoQualityCapture.readReaderReferenceDocument(qualityCapture.reader,()=>true,qualityCapture.reader._internalReader._primaryView._iframeWindow);if(snapshot.document.sourceID!==${JSON.stringify(md5)})throw Error('Reference source differs from corpus bytes');return JSON.stringify({durationMs:Date.now()-start,references:snapshot.document});}catch(e){return JSON.stringify({error:String(e)});}`,
            );
            report.observations.push({
              ...base,
              backend: 'zotero-reader',
              mode,
              status: 'completed',
              ...result,
            });
          } catch (error) {
            report.observations.push({
              ...base,
              backend: 'zotero-reader',
              mode,
              status: 'failed',
              failure: String(error),
            });
          }
          save();
        }
      } catch (error) {
        for (const mode of ['cold', 'warm'])
          report.observations.push({
            ...base,
            backend: 'zotero-reader',
            mode,
            status: 'failed',
            failure: `Reader initialization: ${error}`,
          });
      } finally {
        if (readerReady)
          await execute(
            'await qualityCapture.reader.close();return JSON.stringify({closed:true});',
          );
      }
      for (const backend of ['mineru', 'oxr'])
        report.observations.push({
          ...base,
          backend,
          mode: 'cold',
          status: 'not-performed',
          failure:
            'The native capture command does not execute cloud parsing; provide a separately authorized cloud observation.',
        });
      save();
      console.log(`[quality] Captured ${doc.id}`);
    }
    report.run.finishedAt = new Date().toISOString();
    save();
    console.log(`[quality] Wrote ${report.observations.length} observations to ${args.output}`);
  } finally {
    client.disconnect();
  }
}
capture().catch((error) => {
  console.error(`[quality] ${error.message}`);
  process.exitCode = 1;
});
