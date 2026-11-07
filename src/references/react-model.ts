import type { ScholarlyPaper } from './contracts';

export type ReferenceScene = 'loading' | 'catalog' | 'choose' | 'target' | 'mentions' | 'local' | 'metadata';
export interface ReferenceRow { readonly id: string; readonly label: string }
export interface ReferenceViewModel {
  readonly generation: number;
  readonly chinese: boolean;
  readonly scene: ReferenceScene;
  readonly status: string;
  readonly title: string;
  readonly description: string;
  readonly query: string;
  readonly rows: readonly ReferenceRow[];
  readonly result: string;
  readonly provenance: string;
  readonly paper: ScholarlyPaper | null;
  readonly doi: boolean;
  readonly hasTarget: boolean;
  readonly arxiv: boolean;
}
export type ReferenceCommand = { readonly generation: number } & (
  | { readonly type: 'close' | 'catalog' | 'mentions' | 'local' | 'metadata' | 'back' | 'jump' | 'doi' | 'arxiv' | 'web' | 'local-search' | 'metadata-search' | 'metadata-refresh' | 'metadata-clear' | 'source' | 'pdf' | 'add' }
  | { readonly type: 'query'; readonly value: string }
  | { readonly type: 'select' | 'occurrence' | 'match' | 'candidate'; readonly id: string });
