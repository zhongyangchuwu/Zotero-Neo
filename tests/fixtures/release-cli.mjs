import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

// Model the actual Git/GitHub boundary. In particular, tag lookup excludes
// drafts, and the asset API accepts uploads to published releases too: draft
// safety is the publisher's read/check responsibility, not a fake server guard.
const statePath = process.env.RELEASE_FIXTURE_STATE;
const state = JSON.parse(readFileSync(statePath, 'utf8'));
const args = process.argv.slice(2);
const program = basename(process.argv[1]);
const save = () => writeFileSync(statePath, JSON.stringify(state));
const fail = (message) => {
  console.error(message);
  process.exit(1);
};
const output = (value) => console.log(JSON.stringify(value));
const snapshot = () => {
  if (state.release && !state.release.draft) state.publicSnapshots.push({ ...state.assets });
};
const mutate = (event) => {
  state.mutations.push(event);
  snapshot();
  save();
};
const metadata = () =>
  Object.entries(state.assets).map(([name, data], index) => ({
    id: index + 100,
    name,
    size: Buffer.from(data, 'base64').length,
    state: 'uploaded',
  }));
const option = (flag) => {
  const index = args.indexOf(flag);
  return index < 0 ? undefined : args[index + 1];
};
const values = (flag) => args.flatMap((arg, index) => (arg === flag ? [args[index + 1]] : []));
const pages = (responses) => {
  if (args.includes('--paginate') && args.includes('--slurp')) output(responses);
  else if (args.includes('--paginate')) responses.forEach(output);
  else output(responses[0]);
};
const externalChange = (change, field) => {
  if (change === 'replace') {
    state.release = {
      id: 99,
      tag_name: 'v1.2.3',
      draft: false,
      upload_url: 'https://uploads.github.com/repos/example/neo/releases/99/assets{?name,label}',
    };
    state.assets = {};
  } else {
    state.release.draft = false;
  }
  (state.externalChanges ||= []).push(change);
  delete state[field];
  snapshot();
  save();
};
const upload = (name, file) => {
  if (Object.hasOwn(state.assets, name)) fail('gh: already_exists (HTTP 422)');
  let bytes = readFileSync(file);
  if (state.corruptUpload && name.endsWith('.xpi')) bytes = Buffer.from('corrupt upload');
  state.assets[name] = bytes.toString('base64');
  mutate(`upload:${name}`);
  if (state.failUpload) fail('network failed during upload');
  return metadata().find((asset) => asset.name === name);
};

if (program === 'git') {
  if (args[0] === 'rev-parse' && args[1] === 'HEAD') {
    console.log(state.head);
  } else if (args[0] === 'ls-remote') {
    const ref = args[2];
    if (state.remoteCommit) {
      console.log(`${state.tagObject || state.remoteCommit}\t${ref}`);
      if (state.tagObject) console.log(`${state.remoteCommit}\t${ref}^{}`);
    }
  } else if (args[0] === 'tag') {
    state.localTagCommit = args[2];
    mutate('tag');
  } else if (args[0] === 'push') {
    if (state.remoteCommit) fail('tag already exists');
    state.remoteCommit = state.localTagCommit;
    mutate('push-tag');
  } else {
    fail(`unsupported git operation: ${args.join(' ')}`);
  }
} else if (program === 'gh') {
  if (args[0] === 'api') {
    const endpoint = args.find((arg) => arg.startsWith('repos/') || arg.startsWith('https://'));
    const method = option('--method') || 'GET';
    if (state.apiFailure) fail(state.apiFailure);
    if (endpoint?.startsWith('https://uploads.github.com/')) {
      if (method !== 'POST') fail('upload endpoint requires POST');
      if (
        state.changeAtUpload &&
        Object.keys(state.assets).length === (state.changeAtUploadAssetCount || 0)
      ) {
        externalChange(state.changeAtUpload, 'changeAtUpload');
      }
      const url = new URL(endpoint);
      if (
        !state.release ||
        url.pathname !== `/repos/example/neo/releases/${state.release.id}/assets`
      ) {
        fail('gh: Not Found (HTTP 404)');
      }
      const name = url.searchParams.get('name');
      const file = option('--input');
      const headers = values('-H');
      const bytes = readFileSync(file);
      const mediaType = name.endsWith('.xpi') ? 'application/zip' : 'text/plain; charset=utf-8';
      if (
        !headers.includes(`Content-Type: ${mediaType}`) ||
        !headers.includes(`Content-Length: ${bytes.length}`)
      )
        fail('incorrect raw upload headers');
      // No draft-only guard: the real server permits public asset uploads.
      output(upload(name, file));
    } else if (method === 'POST' && endpoint === 'repos/example/neo/releases') {
      const fields = new Map(
        [...values('-f'), ...values('-F')].map((field) => {
          const split = field.indexOf('=');
          return [field.slice(0, split), field.slice(split + 1)];
        }),
      );
      if (state.release?.tag_name === fields.get('tag_name')) fail('gh: already_exists (HTTP 422)');
      if (
        fields.get('draft') !== 'true' ||
        fields.get('generate_release_notes') !== 'true' ||
        fields.get('target_commitish') !== state.remoteCommit
      )
        fail('invalid draft creation');
      state.release = {
        id: 42,
        tag_name: fields.get('tag_name'),
        draft: true,
        upload_url: 'https://uploads.github.com/repos/example/neo/releases/42/assets{?name,label}',
      };
      state.assets = {};
      mutate('create-draft');
      output(state.release);
    } else if (method === 'PATCH') {
      if (
        !state.release ||
        endpoint !== `repos/example/neo/releases/${state.release.id}` ||
        option('-F') !== 'draft=false'
      )
        fail('invalid publication request');
      state.release.draft = false;
      mutate('publish');
      output(state.release);
    } else if (endpoint === 'repos/example/neo/releases?per_page=100') {
      const current = state.release ? [state.release] : [];
      pages(state.precedingReleases ? [state.precedingReleases, current] : [current]);
    } else if (endpoint === 'repos/example/neo/releases/tags/v1.2.3') {
      if (!state.release || state.release.draft || state.release.tag_name !== 'v1.2.3') {
        fail('gh: Not Found (HTTP 404)');
      }
      output(state.release);
    } else if (/^repos\/example\/neo\/releases\/[0-9]+$/.test(endpoint || '')) {
      if (
        state.changeBeforeRefresh &&
        Object.keys(state.assets).length === (state.changeBeforeRefreshAssetCount || 0)
      ) {
        externalChange(state.changeBeforeRefresh, 'changeBeforeRefresh');
      }
      if (!state.release || endpoint !== `repos/example/neo/releases/${state.release.id}`) {
        fail('gh: Not Found (HTTP 404)');
      }
      output(state.wrongTagOnRead ? { ...state.release, tag_name: 'v9.9.9' } : state.release);
    } else if (
      state.release &&
      endpoint === `repos/example/neo/releases/${state.release.id}/assets`
    ) {
      const assets = metadata();
      pages([assets.slice(0, 1), assets.slice(1)]);
    } else if (/^repos\/example\/neo\/releases\/assets\/[0-9]+$/.test(endpoint || '')) {
      const id = Number(endpoint.split('/').at(-1));
      const asset = metadata().find((entry) => entry.id === id);
      if (!asset) fail('gh: Not Found (HTTP 404)');
      if (!values('-H').includes('Accept: application/octet-stream')) output(asset);
      else process.stdout.write(Buffer.from(state.assets[asset.name], 'base64'));
      if (state.moveTagOnDownload) {
        state.remoteCommit = 'e'.repeat(40);
        save();
      }
    } else {
      fail(`unsupported API endpoint: ${endpoint}`);
    }
  } else if (args[0] === 'release' && args[1] === 'upload') {
    // Faithful fallback for detecting a regression to tag-resolved CLI uploads.
    if (
      !state.release ||
      args[2] !== state.release.tag_name ||
      option('--repo') !== 'example/neo'
    ) {
      fail('release not found');
    }
    if (state.changeAtUpload) externalChange(state.changeAtUpload, 'changeAtUpload');
    for (const file of args.slice(3, args.indexOf('--repo'))) upload(basename(file), file);
  } else if (args[0] === 'release' && args[1] === 'download') {
    if (
      !state.release ||
      args[2] !== state.release.tag_name ||
      option('--repo') !== 'example/neo'
    ) {
      fail('release not found');
    }
    for (const name of values('--pattern')) {
      if (!state.assets[name]) fail('missing download asset');
      writeFileSync(join(option('--dir'), name), Buffer.from(state.assets[name], 'base64'));
    }
  } else {
    fail(`unsupported gh operation: ${args.join(' ')}`);
  }
} else {
  fail(`unsupported fixture program: ${program}`);
}
