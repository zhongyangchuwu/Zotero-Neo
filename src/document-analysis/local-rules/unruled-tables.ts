import {
  bounds,
  centerY,
  contains,
  corridor,
  gapY,
  height,
  intersects,
  overlapY,
  width,
} from './geometry';
import { proseLine, textLines } from './text';
import type { Caption, Line, LocalFigureText, LocalRuleRect, RuleContext } from './types';

/**
 * Repeated cells can prove a table without painted rules. Reconstruct their whitespace from
 * native chunks, not merged prose lines; require multiple rows and two stable cell starts.
 * The caption bounds the search horizontally, while prose and other captions split row chains.
 */
export function tableTextGroups(
  lines: readonly Line[],
  captions: readonly Caption[],
  graphics: readonly LocalRuleRect[],
  barriers: ReadonlySet<Line>,
  unit: number,
  leading: number,
  context: RuleContext,
): { rect: LocalRuleRect; labels: Set<Line> }[] {
  const { minRows, minColumns, enabled } = context.profile.rules.unruledTables;
  if (!enabled) return [];
  if (!captions.some((caption) => caption.identity.kind === 'table')) return [];
  const cells = textLines(
    lines.flatMap((line) => line.chunks).filter((chunk) => chunk.fontSize >= unit * 0.85),
    unit,
    unit * 0.75,
  );
  const paragraphLines = lines.filter((line) => barriers.has(line) || proseLine(line, unit));
  const chunkLines = new Map<LocalFigureText, Line>();
  for (const line of lines) for (const chunk of line.chunks) chunkLines.set(chunk, line);
  const groups: { rect: LocalRuleRect; labels: Set<Line> }[] = [];
  for (const caption of captions) {
    if (caption.identity.kind !== 'table') continue;
    let left = caption.rect[0] - unit * 3;
    let right = caption.rect[2] + unit * 3;
    for (const other of captions) {
      if (other === caption || overlapY(other.rect, caption.rect) <= 0) continue;
      if (other.rect[2] < caption.rect[0]) left = Math.max(left, other.rect[2] + unit * 0.5);
      if (other.rect[0] > caption.rect[2]) right = Math.min(right, other.rect[0] - unit * 0.5);
    }
    const rows: Line[][] = [];
    for (const cell of cells) {
      if (
        cell.rect[0] < left ||
        cell.rect[2] > right ||
        captions.some((other) => intersects(other.rect, cell.rect))
      )
        continue;
      const last = rows[rows.length - 1];
      if (last && Math.abs(centerY(last[0]!.rect) - centerY(cell.rect)) <= unit * 0.4)
        last.push(cell);
      else rows.push([cell]);
    }
    const grid = rows.filter(
      (row) =>
        row.length >= minColumns &&
        row.some((cell) => !proseLine(cell, unit)) &&
        Math.max(...row.map((cell) => cell.rect[0])) -
          Math.min(...row.map((cell) => cell.rect[0])) >=
          unit * 2.5,
    );
    const columns: { x: number; rows: Set<Line[]> }[] = [];
    for (const row of grid) {
      for (const cell of row) {
        let column = columns.find(
          (candidate) => Math.abs(candidate.x - cell.rect[0]) <= unit * 0.6,
        );
        if (!column) {
          column = { x: cell.rect[0], rows: new Set() };
          columns.push(column);
        }
        column.rows.add(row);
      }
    }
    const stable = columns.filter((column) => column.rows.size >= minRows);
    const supported = grid.filter(
      (row) => stable.filter((column) => column.rows.has(row)).length >= minColumns,
    );
    if (stable.length < minColumns || supported.length < minRows) {
      context.observe?.({
        pageIndex: context.pageIndex,
        ruleId: 'unruledTables',
        outcome: 'rejected',
        reason: stable.length < minColumns ? 'missing-stable-columns' : 'missing-repeated-rows',
        rect: caption.rect,
      });
    }
    const chains: Line[][][] = [];
    for (const row of supported) {
      const previous = chains[chains.length - 1];
      const previousRow = previous?.[previous.length - 1];
      const previousRect = previousRow && bounds(previousRow.map((cell) => cell.rect));
      const rect = bounds(row.map((cell) => cell.rect));
      const passage = previousRect && corridor(previousRect, rect);
      const separated =
        previousRect &&
        (gapY(previousRect, rect) > leading * 2.2 ||
          captions.some((other) => intersects(other.rect, passage!)) ||
          // Subscripts extend a member's source line into the row gap; they are not a paragraph barrier.
          paragraphLines.some(
            (line) =>
              intersects(line.rect, passage!) &&
              !row.some((cell) => cell.chunks.some((chunk) => chunkLines.get(chunk) === line)) &&
              !previousRow!.some((cell) =>
                cell.chunks.some((chunk) => chunkLines.get(chunk) === line),
              ),
          ));
      if (separated && previousRect && gapY(previousRect, rect) <= leading * 2.2)
        context.observe?.({
          pageIndex: context.pageIndex,
          ruleId: 'unruledTables',
          outcome: 'rejected',
          reason: 'prose-or-caption-barrier',
          rect: passage!,
        });
      if (!previous || separated) chains.push([row]);
      else previous.push(row);
    }
    for (const chain of chains) {
      if (chain.length < minRows) continue;
      let rect = bounds(chain.flatMap((row) => row.map((cell) => cell.rect)));
      context.observe?.({
        pageIndex: context.pageIndex,
        ruleId: 'unruledTables',
        outcome: 'candidate',
        reason: 'repeated-cell-grid',
        rect,
      });
      if (
        gapY(caption.rect, rect) > leading * 6 ||
        intersects(caption.rect, rect) ||
        captions.some(
          (other) =>
            other !== caption &&
            (intersects(other.rect, rect) || intersects(other.rect, corridor(caption.rect, rect))),
        )
      )
        continue;
      const members = new Set(chain.flat());
      // Include adjacent headers and full-width numeric rows, but never an ordinary paragraph.
      // A lexical header needs a real separator between it and the established cell grid.
      for (const row of rows) {
        const rowRect = bounds(row.map((cell) => cell.rect));
        if (gapY(rowRect, rect) > leading * 1.6) continue;
        const aligned = row.some((cell) =>
          stable.some((column) => Math.abs(column.x - cell.rect[0]) <= unit * 0.6),
        );
        const header =
          rowRect[1] >= rect[3] - unit * 0.1 &&
          row.every(
            (cell) => !proseLine(cell, unit) || Math.abs(cell.fontSize - unit) <= unit * 0.08,
          ) &&
          graphics.some(
            (rule) =>
              height(rule) <= unit * 0.3 &&
              rule[0] >= left &&
              rule[2] <= right &&
              width(rule) >= width(rect) * 0.8 &&
              intersects(rule, corridor(rowRect, rect)),
          );
        if (
          !contains(rect, rowRect, unit * 0.1) &&
          !(aligned && row.every((cell) => !proseLine(cell, unit))) &&
          !header
        )
          continue;
        const expanded = bounds([rect, rowRect]);
        if (captions.some((other) => intersects(other.rect, expanded))) continue;
        for (const cell of row) members.add(cell);
      }
      rect = bounds([...members].map((cell) => cell.rect));
      const labels = new Set<Line>();
      for (const cell of members)
        for (const chunk of cell.chunks) labels.add(chunkLines.get(chunk)!);
      for (const line of lines)
        if (line.fontSize < unit * 0.85 && contains(rect, line.rect, unit * 0.8)) labels.add(line);
      if (
        paragraphLines.some((line) => !labels.has(line) && intersects(line.rect, rect)) ||
        paragraphLines.some(
          (line) => !labels.has(line) && intersects(line.rect, corridor(caption.rect, rect)),
        )
      ) {
        context.observe?.({
          pageIndex: context.pageIndex,
          ruleId: 'unruledTables',
          outcome: 'rejected',
          reason: 'prose-barrier',
          rect,
        });
        continue;
      }
      context.observe?.({
        pageIndex: context.pageIndex,
        ruleId: 'unruledTables',
        outcome: 'accepted',
        reason: 'caption-bounded-cells',
        rect,
      });
      groups.push({ rect: bounds([rect, ...[...labels].map((line) => line.rect)]), labels });
    }
  }
  return groups;
}
