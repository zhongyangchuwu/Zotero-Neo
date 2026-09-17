export interface FuzzyResult {
  readonly score: number;
  readonly target: string;
  readonly indexes: ReadonlyArray<number>;
}

export function single(search: string, target: string): FuzzyResult | null;

declare const fuzzysort: {
  single: typeof single;
};

export default fuzzysort;
