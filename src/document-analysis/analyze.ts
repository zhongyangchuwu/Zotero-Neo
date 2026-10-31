import {
  checkParseCurrent,
  type DocumentObjectGroup,
  type DocumentParser,
  type DocumentSource,
  type ParseContext,
  type ParsedDocument,
} from './contracts';
import { documentObjectGroups } from './object-groups';

export interface AnalyzedDocument extends ParsedDocument {
  readonly objectGroups: readonly DocumentObjectGroup[];
}

/** The complete parser supplies normalized regions; shared postprocessing owns object relationships. */
export async function analyzeDocument(
  parser: DocumentParser,
  source: DocumentSource,
  context: ParseContext,
): Promise<AnalyzedDocument> {
  checkParseCurrent(context.signal);
  const parsed = await parser.parse(source, context);
  checkParseCurrent(context.signal);
  return analyzeParsedDocument(parsed, source);
}

/** Recompute derived relationships from saved regions so grouping improvements do not require another upload. */
export function analyzeParsedDocument(
  parsed: ParsedDocument,
  source: DocumentSource,
): AnalyzedDocument {
  if (parsed.sourceFingerprint !== source.fingerprint)
    throw new Error('Parser returned a different PDF revision');
  return { ...parsed, objectGroups: documentObjectGroups(parsed.regions) };
}
