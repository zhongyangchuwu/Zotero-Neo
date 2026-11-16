export { createScholarlyMetadataService } from './service';
export { extractScholarlyQuery } from './query';
export { normalizeArxiv, normalizeDOI } from './identifiers';
export { ScholarlyError } from './contracts';
export type {
  ScholarlySource,
  ScholarlyPaper,
  ScholarlyQuery,
  ScholarlyCacheInfo,
  ScholarlyLookupResult,
  ScholarlyMetadataService,
} from './contracts';
