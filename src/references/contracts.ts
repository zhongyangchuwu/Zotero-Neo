/** Only existing scholarly records are projected; generated summaries and classifications are excluded. */
export interface ScholarlyPaper {
  readonly source: 'semantic-scholar' | 'arxiv';
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
}

export interface ReferenceQuery {
  readonly text: string;
  readonly doi?: string;
  readonly arxivID?: string;
}

export type ReferenceLookupResult =
  | { readonly kind: 'found'; readonly paper: ScholarlyPaper }
  | { readonly kind: 'candidates'; readonly papers: readonly ScholarlyPaper[] }
  | { readonly kind: 'not-found' };

export interface ReferenceMetadataService {
  lookup(query: ReferenceQuery, signal: AbortSignal): Promise<ReferenceLookupResult>;
  hasSemanticScholarKey(): Promise<boolean>;
  setSemanticScholarKey(key: string | null): Promise<void>;
  dispose(): void;
}

export interface ReferenceLocalMatch {
  readonly itemID: number;
  readonly attachmentID: number | null;
  readonly title: string;
}
