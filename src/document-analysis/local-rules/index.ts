import type { DocumentRegion } from '../contracts';
import { figureTextExclusions } from './exclusions';
import { height, width } from './geometry';
import { pageTextLayout } from './layout';
import { pageFigureRegions } from './ownership';
import { paragraphRegions } from './paragraphs';
import { DEFAULT_LOCAL_RULE_PROFILE, type LocalRuleProfile } from './profile';
import { region } from './regions';
import { graphicsFromPage } from './structures';
import type { LocalFigurePage, LocalRuleObserver, LocalRuleRegion, RuleContext } from './types';

export { documentCaptionIdentity, type DocumentCaptionIdentity } from './caption-identity';
export {
  DEFAULT_LOCAL_RULE_PROFILE,
  LOCAL_RULE_ENGINE_REVISION,
  LOCAL_RULE_GEOMETRY_REVISION,
  parseLocalRuleProfile,
  resolveLocalRuleProfile,
  type LocalRuleOptions,
  type LocalRuleProfile,
} from './profile';
export type {
  LocalFigurePage,
  LocalFigureText,
  LocalRuleDiagnostic,
  LocalRuleObserver,
  LocalRuleRect,
  LocalRuleRegion,
} from './types';

/** Pure, conservative caption-to-visual association in unrotated PDF coordinates. */
export function localFigureRegions(
  pages: readonly LocalFigurePage[],
  profile: LocalRuleProfile = DEFAULT_LOCAL_RULE_PROFILE,
  observe?: LocalRuleObserver,
): readonly LocalRuleRegion[] {
  const result: LocalRuleRegion[] = [];
  for (const page of [...pages].sort((a, b) => a.pageIndex - b.pageIndex)) {
    const context: RuleContext = { pageIndex: page.pageIndex, profile, observe };
    const layout = pageTextLayout(page, context);
    if (!layout || !layout.captions.length) continue;
    const graphics = graphicsFromPage(page, layout, context);
    result.push(...pageFigureRegions(page.pageIndex, layout, graphics, context));
  }
  return result;
}

/** Complete local regions, with explicit figure/caption text exclusions for paragraphs. */
export function localDocumentRegions(
  pages: readonly LocalFigurePage[],
  profile: LocalRuleProfile = DEFAULT_LOCAL_RULE_PROFILE,
  observe?: LocalRuleObserver,
): readonly LocalRuleRegion[] {
  const result: LocalRuleRegion[] = [];
  let order = 0;
  for (const page of [...pages].sort((a, b) => a.pageIndex - b.pageIndex)) {
    const context: RuleContext = { pageIndex: page.pageIndex, profile, observe };
    const rules = completePage(page, context, order, false);
    if (!rules) continue;
    const { objects, paragraphs } = rules;
    order += paragraphs.length;
    result.push(...objects, ...paragraphs);
  }
  return result;
}

/** Explicit body and exclusion evidence for selection, independent of missing regions. */
export function localVisibleRegions(page: LocalFigurePage): readonly DocumentRegion[] {
  const context: RuleContext = { pageIndex: page.pageIndex, profile: DEFAULT_LOCAL_RULE_PROFILE };
  const rules = completePage(page, context, 0, true);
  if (!rules) return [];
  return [
    ...rules.objects,
    ...rules.paragraphs,
    ...[...rules.excluded].map((line, index) => ({
      ...region(
        `local:${page.pageIndex}:excluded:${index}`,
        page.pageIndex,
        'text',
        line.rect,
        line.text,
      ),
      flow: 'excluded' as const,
    })),
  ];
}

function completePage(
  page: LocalFigurePage,
  context: RuleContext,
  order: number,
  markMargins: boolean,
) {
  const layout = pageTextLayout(page, context);
  if (!layout) return null;
  const graphics = graphicsFromPage(page, layout, context);
  const objects = pageFigureRegions(page.pageIndex, layout, graphics, context);
  const excluded = new Set(figureTextExclusions(layout, graphics, objects, context));
  if (markMargins) {
    const [left, bottom, right, top] = page.viewBox;
    const edge = layout.unit * 2;
    for (const line of layout.lines) {
      const [x1, y1, x2, y2] = line.rect;
      const folio =
        (y1 <= bottom + edge || y2 >= top - edge) &&
        line.fontSize <= layout.unit &&
        /^(?:\d{1,4}|[ivxlcdm]{1,7})$/iu.test(line.text);
      const verticalLabel =
        (x1 <= left + edge || x2 >= right - edge) &&
        width(line.rect) <= layout.unit * 1.4 &&
        height(line.rect) >= layout.unit * 3;
      if (folio || verticalLabel) excluded.add(line);
    }
  }
  return {
    objects,
    paragraphs: paragraphRegions(page.pageIndex, layout, excluded, order),
    excluded,
  };
}
