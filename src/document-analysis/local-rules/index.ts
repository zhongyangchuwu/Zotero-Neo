import { figureTextExclusions } from './exclusions';
import { pageTextLayout } from './layout';
import { pageFigureRegions } from './ownership';
import { paragraphRegions } from './paragraphs';
import { DEFAULT_LOCAL_RULE_PROFILE, type LocalRuleProfile } from './profile';
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
    const layout = pageTextLayout(page, context);
    if (!layout) continue;
    const graphics = graphicsFromPage(page, layout, context);
    const objects = pageFigureRegions(page.pageIndex, layout, graphics, context);
    const excludedLines = figureTextExclusions(layout, graphics, objects, context);
    const paragraphs = paragraphRegions(page.pageIndex, layout, excludedLines, order);
    order += paragraphs.length;
    result.push(...objects, ...paragraphs);
  }
  return result;
}
