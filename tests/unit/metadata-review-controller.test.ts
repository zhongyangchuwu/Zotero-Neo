// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  artifactHeads,
  type ArtifactInput,
  type NeoArtifact,
  type NeoArtifactRepository,
} from '../../src/artifacts';
import type {
  MetadataReviewCommand,
  MetadataReviewModel,
} from '../../src/metadata-review/react-model';
import type { ScholarlyMetadataService, ScholarlyPaper } from '../../src/scholarly/contracts';

const host = vi.hoisted(() => ({
  view: null as null | {
    model: MetadataReviewModel;
    dispatch: (command: MetadataReviewCommand) => void;
  },
}));
vi.mock('../../src/platform/native-ui', () => ({
  mountNativeReactView: (options: {
    model: MetadataReviewModel;
    dispatch: (command: MetadataReviewCommand) => void;
  }) => {
    const view = { model: options.model, dispatch: options.dispatch };
    host.view = view;
    return {
      ready: Promise.resolve(),
      update: (model: MetadataReviewModel) => {
        view.model = model;
      },
      getElement: () => null,
      dispose: () => {},
    };
  },
}));
vi.mock('../../src/operations/artifact-note', () => ({
  projectArtifactNote: vi.fn(async () => ({})),
}));
import { MetadataReviewController } from '../../src/metadata-review/controller';

let controller: MetadataReviewController | undefined;
beforeEach(() => {
  host.view = null;
});
afterEach(() => {
  controller?.dispose();
  controller = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('retries an imported receipt with the same revision instead of creating a false branch or applying fields twice', async () => {
  const fields: Record<string, string> = { title: 'Original title' };
  const save = vi.fn(async () => {});
  const item = {
    id: 1,
    key: 'ABCD2345',
    libraryID: 1,
    itemTypeID: 2,
    deleted: false,
    isRegularItem: () => true,
    getField: (field: string) => fields[field] || '',
    setField: (field: string, value: string) => {
      fields[field] = value;
    },
    getCreatorsJSON: () => [],
    setCreators: () => {},
    save,
  } as unknown as Zotero.Item;
  let revision = 0;
  vi.stubGlobal('Components', { utils: { isDeadWrapper: () => false } });
  vi.stubGlobal('Zotero', {
    Libraries: { get: () => ({ editable: true }) },
    Items: { getAsync: async () => item },
    ItemFields: { getID: (name: string) => name, isValidForType: () => true },
    Utilities: { randomString: () => `revision-${++revision}` },
    DB: { executeTransaction: async (run: () => Promise<unknown>) => run() },
  });
  const artifacts: NeoArtifact[] = [];
  let loseAcknowledgement = true;
  const repository: NeoArtifactRepository = {
    list: async () => ({
      artifacts: [...artifacts],
      complete: true,
      availability: 'local-only',
      issues: [],
    }),
    publish: async (_parent, input: ArtifactInput) => {
      const revisionID = input.revisionID ?? `revision-${++revision}`;
      const existing = artifacts.find((artifact) => artifact.revisionID === revisionID);
      if (existing)
        return {
          artifact: existing,
          attachmentKey: `JSON${artifacts.indexOf(existing)}`,
          reused: true,
        };
      const artifact: NeoArtifact = {
        format: 'zotero-neo',
        schemaVersion: 1,
        libraryURI: 'http://zotero.org/users/1',
        parentItemKey: item.key,
        kind: input.kind,
        recordID: input.recordID,
        revisionID,
        parentRevisions: input.parentRevisions ?? [],
        createdAt: '2026-01-01T00:00:00Z',
        producer: { name: 'Zotero Neo', version: '1' },
        payload: input.payload,
      };
      artifacts.push(artifact);
      if ('stage' in input.payload && input.payload.stage === 'applied' && loseAcknowledgement) {
        loseAcknowledgement = false;
        throw new Error('Native import completed, but read-back acknowledgement failed');
      }
      return { artifact, attachmentKey: `JSON${artifacts.length - 1}`, reused: false };
    },
  };
  const paper: ScholarlyPaper = {
    source: 'crossref',
    sourceID: '10.1234/example',
    title: fields.title!,
    authors: [],
    year: null,
    venue: null,
    abstract: null,
    doi: null,
    arxivID: null,
    url: null,
    pdfURL: null,
    referenceCount: null,
    citationCount: null,
    retrievedAt: '2026-01-01T00:00:00Z',
    bibliography: { volume: '12' },
  };
  const metadata: ScholarlyMetadataService = {
    sources: [{ id: 'crossref', label: 'Crossref', capabilities: ['lookup', 'search'] }],
    lookup: async () => ({ kind: 'found', paper }),
    clearCache: async () => {},
    dispose: () => {},
  };
  controller = new MetadataReviewController(metadata, repository, () => {});
  controller.open({
    window,
    items: [item],
    language: () => 'en',
    themeRoot: () => () => {},
    isCurrent: () => true,
  });
  const view = host.view!;
  view.dispatch({ type: 'inspect' });
  await vi.waitFor(() =>
    expect(view.model.fields.some((field) => field.field === 'volume')).toBe(true),
  );
  view.dispatch({ type: 'apply' });
  await vi.waitFor(() => {
    expect(view.model.busy).toBe(false);
    expect(view.model.error).toBe(true);
  });
  expect(fields.volume).toBe('12');
  expect(view.model.canApply).toBe(false);
  view.dispatch({ type: 'save' });
  await vi.waitFor(() => expect(view.model.busy).toBe(false));
  expect(view.model.error).toBe(false);
  expect(save).toHaveBeenCalledTimes(1);
  expect(artifacts).toHaveLength(2);
  const heads = artifactHeads(artifacts, artifacts[0]!.recordID);
  expect(heads).toHaveLength(1);
  expect(heads[0]!.parentRevisions).toEqual([artifacts[0]!.revisionID]);
  expect(heads[0]!.payload).toMatchObject({ stage: 'applied', appliedFields: ['volume'] });
});
