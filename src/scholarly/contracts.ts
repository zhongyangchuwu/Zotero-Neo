/** Scholarly records are source data, never generated summaries or inferred author parts. */
export type ScholarlySource = 'semantic-scholar' | 'arxiv' | 'crossref' | 'inspire';

export interface ScholarlyPaper {
  readonly source: ScholarlySource;
  readonly sourceID: string;
  readonly title: string;
  readonly authors: readonly string[];
  readonly year: number | null;
  readonly venue: string | null;
  readonly abstract: string | null;
  readonly doi: string | null;
  readonly arxivID: string | null;
  readonly url: string | null;
  readonly pdfURL: string | null;
  readonly referenceCount: number | null;
  readonly citationCount: number | null;
  readonly retrievedAt: string;
  readonly bibliography?: {
    readonly date?: string;
    readonly volume?: string;
    readonly issue?: string;
    readonly pages?: string;
    readonly publisher?: string;
    readonly creators?: readonly { readonly firstName: string; readonly lastName: string }[];
  };
  readonly version?: {
    readonly id?: string;
    readonly updated?: string;
    readonly published?: string;
  };
  /** Provider proposal only. Never replaces the item's Zotero/Better BibTeX key. */
  readonly citekey?: string;
}

export interface ScholarlyQuery {
  readonly text: string;
  readonly doi?: string;
  readonly arxivID?: string;
  readonly title?: string;
  readonly authors?: readonly string[];
  readonly year?: number;
  readonly venue?: string;
  readonly bibtex?: string;
  readonly citekey?: string;
}

export interface ScholarlyCacheInfo {
  readonly origin: 'cached' | 'network';
  readonly stale: boolean;
  readonly warning?: string;
}

export type ScholarlyLookupResult =
  | { readonly kind: 'found'; readonly paper: ScholarlyPaper; readonly cache?: ScholarlyCacheInfo }
  | {
      readonly kind: 'candidates';
      readonly papers: readonly ScholarlyPaper[];
      readonly cache?: ScholarlyCacheInfo;
    }
  | { readonly kind: 'not-found'; readonly cache?: ScholarlyCacheInfo };

export interface ScholarlyMetadataService {
  readonly sources: readonly {
    readonly id: ScholarlySource;
    readonly label: string;
    readonly capabilities: readonly ('lookup' | 'search' | 'version')[];
  }[];
  lookup(
    query: ScholarlyQuery,
    signal: AbortSignal,
    options?: { readonly mode?: 'cache-only' | 'refresh'; readonly source?: ScholarlySource },
  ): Promise<ScholarlyLookupResult>;
  clearCache(): Promise<void>;
  dispose(): void;
}

export class ScholarlyError extends Error {
  constructor(
    readonly kind: 'unsupported' | 'auth' | 'rate' | 'network' | 'decode',
    readonly source: ScholarlySource,
    message: string,
  ) {
    super(message);
    this.name = 'ScholarlyError';
  }
}
