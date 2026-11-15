import type { DocumentCaptionIdentity } from './caption-identity';
import type { LocalRuleProfile } from './profile';

export type LocalRuleRect = readonly [number, number, number, number];

export interface LocalRuleRegion {
  readonly id: string;
  readonly pageIndex: number;
  readonly kind: 'caption' | 'image' | 'table' | 'text' | 'heading';
  readonly rect: LocalRuleRect;
  readonly text: string;
  readonly format: 'text';
  readonly flow: 'body' | 'auxiliary';
  readonly anchorPrecision: 'region';
  readonly sourceObject?: { readonly id: string; readonly kind: 'figure' | 'table' };
  readonly sourceBlock?: { readonly id: string; readonly order: number };
}

export interface LocalRuleDiagnostic {
  readonly pageIndex: number;
  readonly ruleId: string;
  readonly outcome: 'candidate' | 'accepted' | 'rejected' | 'ambiguous';
  readonly reason: string;
  readonly captionId?: string;
  readonly candidateIds?: readonly string[];
  readonly rect?: LocalRuleRect;
}
export type LocalRuleObserver = (event: LocalRuleDiagnostic) => void;

/** One immutable, already-resolved configuration for the whole extraction. */
export interface RuleContext {
  readonly pageIndex: number;
  readonly profile: LocalRuleProfile;
  readonly observe?: LocalRuleObserver;
}

export interface LocalFigureText {
  readonly text: string;
  readonly rect: LocalRuleRect;
  readonly fontSize: number;
  readonly hasEOL?: boolean;
}

export interface LocalFigurePage {
  readonly pageIndex: number;
  readonly viewBox: LocalRuleRect;
  readonly text: readonly LocalFigureText[];
  readonly graphics: readonly LocalRuleRect[];
}

export interface Line {
  readonly rect: LocalRuleRect;
  readonly text: string;
  readonly fontSize: number;
  readonly chunks: readonly LocalFigureText[];
}
export interface TextRow {
  rect: LocalRuleRect;
  readonly chunks: LocalFigureText[];
}
export interface Caption {
  readonly identity: DocumentCaptionIdentity;
  readonly lines: readonly Line[];
  readonly rect: LocalRuleRect;
  readonly text: string;
}
export interface Graphic {
  readonly index: number;
  readonly rect: LocalRuleRect;
  /** Text membership proved by local adjacency or repeated caption-bounded cells. */
  readonly labels: ReadonlySet<Line>;
}
export interface Body {
  readonly graphic: Graphic;
  readonly rect: LocalRuleRect;
  readonly text: string;
}

export interface PageTextLayout {
  readonly unit: number;
  readonly leading: number;
  readonly lines: readonly Line[];
  readonly captions: readonly Caption[];
  readonly barriers: ReadonlySet<Line>;
}

export interface TextEvidence {
  readonly rect: LocalRuleRect;
  readonly labels: ReadonlySet<Line>;
}

export interface PaintedComponent {
  readonly members: readonly LocalRuleRect[];
  readonly rect: LocalRuleRect;
}

export interface ComponentLink {
  readonly from: number;
  readonly to: number;
}
