import { documentCaptionIdentity, type DocumentCaptionIdentity } from './caption-identity';
import type { DocumentRect, DocumentRegion } from './contracts';

export interface LocalFigureText {
  readonly text: string;
  readonly rect: DocumentRect;
  readonly fontSize: number;
  readonly hasEOL?: boolean;
}

export interface LocalFigurePage {
  readonly pageIndex: number;
  readonly viewBox: DocumentRect;
  readonly text: readonly LocalFigureText[];
  readonly graphics: readonly DocumentRect[];
}

interface Line {
  readonly rect: DocumentRect;
  readonly text: string;
  readonly fontSize: number;
  readonly chunks: readonly LocalFigureText[];
}
interface TextRow {
  rect: DocumentRect;
  readonly chunks: LocalFigureText[];
}
interface Caption {
  readonly identity: DocumentCaptionIdentity;
  readonly lines: readonly Line[];
  readonly rect: DocumentRect;
  readonly text: string;
}
interface Graphic {
  readonly index: number;
  readonly rect: DocumentRect;
  /** Text membership proved by local adjacency or repeated caption-bounded cells. */
  readonly labels: ReadonlySet<Line>;
}
interface Body {
  readonly graphic: Graphic;
  readonly rect: DocumentRect;
  readonly text: string;
}

interface PageTextLayout {
  readonly unit: number;
  readonly leading: number;
  readonly lines: readonly Line[];
  readonly captions: readonly Caption[];
  readonly barriers: ReadonlySet<Line>;
}

const width = (r: DocumentRect): number => r[2] - r[0];
const height = (r: DocumentRect): number => r[3] - r[1];
const centerX = (r: DocumentRect): number => (r[0] + r[2]) / 2;
const centerY = (r: DocumentRect): number => (r[1] + r[3]) / 2;
const overlapX = (a: DocumentRect, b: DocumentRect): number =>
  Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
const overlapY = (a: DocumentRect, b: DocumentRect): number =>
  Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
const gapX = (a: DocumentRect, b: DocumentRect): number => Math.max(0, -overlapX(a, b));
const gapY = (a: DocumentRect, b: DocumentRect): number => Math.max(0, -overlapY(a, b));
const readingOrder = (a: DocumentRect, b: DocumentRect): number =>
  b[3] - a[3] || a[0] - b[0] || b[1] - a[1] || a[2] - b[2];
const valid = (r: DocumentRect): boolean =>
  r.every(Number.isFinite) && width(r) > 0 && height(r) > 0;
const intersects = (a: DocumentRect, b: DocumentRect): boolean =>
  overlapX(a, b) > 0 && overlapY(a, b) > 0;
const contains = (outer: DocumentRect, inner: DocumentRect, pad = 0): boolean =>
  inner[0] >= outer[0] - pad &&
  inner[1] >= outer[1] - pad &&
  inner[2] <= outer[2] + pad &&
  inner[3] <= outer[3] + pad;

function bounds(rects: readonly DocumentRect[]): DocumentRect {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r[0]);
    y0 = Math.min(y0, r[1]);
    x1 = Math.max(x1, r[2]);
    y1 = Math.max(y1, r[3]);
  }
  return [x0, y0, x1, y1];
}

function median(values: readonly number[], fallback: number): number {
  if (!values.length) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

/** Character weighting prevents a handful of headings or plot ticks setting the body scale. */
function textScale(text: readonly LocalFigureText[], fallback: number): number {
  const samples = text
    .filter((t) => Number.isFinite(t.fontSize) && t.fontSize > 0)
    .map((t) => ({ size: t.fontSize, weight: Math.max(1, t.text.trim().length) }))
    .sort((a, b) => a.size - b.size);
  const half = samples.reduce((sum, t) => sum + t.weight, 0) / 2;
  let weight = 0;
  for (const sample of samples) {
    weight += sample.weight;
    if (weight >= half) return sample.size;
  }
  return fallback;
}

/** Aligned prose starts and sibling caption leads reveal gutters narrower than a cell-gap cutoff. */
function columnBoundaries(rows: readonly TextRow[], unit: number): number[] {
  const alignments: { x: number; count: number; rows: Set<number>; bottom: number; top: number }[] =
    [];
  const captionGutters: number[] = [];
  rows.forEach((row, rowIndex) => {
    const leads = row.chunks.filter((chunk) => documentCaptionIdentity(chunk.text));
    if (leads.length > 1) {
      for (const lead of leads.slice(1)) {
        const previous = row.chunks[row.chunks.indexOf(lead) - 1];
        if (
          previous &&
          lead.rect[0] - leads[0]!.rect[0] >= unit * 6 &&
          lead.rect[0] - previous.rect[2] > unit * 0.75
        )
          captionGutters.push(lead.rect[0]);
      }
    }
    row.chunks.forEach((chunk, index) => {
      if (chunk.text.trim().length < 16 || width(chunk.rect) < unit * 6) return;
      const previous = row.chunks[index - 1];
      if (previous && chunk.rect[0] - previous.rect[2] < unit * 0.75) return;
      let alignment = alignments.find((group) => Math.abs(group.x - chunk.rect[0]) <= unit * 0.6);
      if (!alignment) {
        alignment = {
          x: chunk.rect[0],
          count: 0,
          rows: new Set(),
          bottom: chunk.rect[1],
          top: chunk.rect[3],
        };
        alignments.push(alignment);
      }
      alignment.x = (alignment.x * alignment.count + chunk.rect[0]) / (alignment.count + 1);
      alignment.count++;
      alignment.rows.add(rowIndex);
      alignment.bottom = Math.min(alignment.bottom, chunk.rect[1]);
      alignment.top = Math.max(alignment.top, chunk.rect[3]);
    });
  });
  const starts: number[] = [];
  for (const alignment of alignments.sort((a, b) => a.x - b.x)) {
    if (alignment.rows.size < 3 || alignment.top - alignment.bottom < unit * 2) continue;
    // Nearby indents and hanging caption text belong to the same column.
    if (!starts.length || alignment.x - starts[starts.length - 1]! >= unit * 12)
      starts.push(alignment.x);
  }
  return [...new Set([...starts.slice(1), ...captionGutters])].sort((a, b) => a - b);
}

/** Build visual rows, then split column/cell gaps instead of trusting PDF content-stream order. */
function textLines(text: readonly LocalFigureText[], unit: number, cellGap = unit * 2.5): Line[] {
  const rows: TextRow[] = [];
  for (const chunk of [...text].sort(
    (a, b) => readingOrder(a.rect, b.rect) || a.text.localeCompare(b.text),
  )) {
    let row: (typeof rows)[number] | undefined;
    for (let i = rows.length - 1; i >= 0; i--) {
      const candidate = rows[i]!;
      if (candidate.rect[1] > chunk.rect[3] + unit) break;
      if (
        Math.abs(centerY(candidate.rect) - centerY(chunk.rect)) <=
        Math.min(height(chunk.rect), height(candidate.rect)) * 0.4
      ) {
        row = candidate;
        break;
      }
    }
    if (row) {
      row.chunks.push(chunk);
      row.rect = bounds([row.rect, chunk.rect]);
    } else rows.push({ rect: chunk.rect, chunks: [chunk] });
  }
  for (const row of rows)
    row.chunks.sort((a, b) => a.rect[0] - b.rect[0] || a.text.localeCompare(b.text));
  const boundaries = columnBoundaries(rows, unit);
  const lines: Line[] = [];
  for (const row of rows) {
    const chunks = row.chunks;
    let parts: LocalFigureText[] = [];
    let prefix = '';
    let captionStart = false;
    const flush = (): void => {
      if (!parts.length) return;
      let content = '';
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]!;
        const previous = parts[i - 1];
        const space = previous && part.rect[0] - previous.rect[2] > unit * 0.12;
        content += (space ? ' ' : '') + part.text;
      }
      lines.push({
        rect: bounds(parts.map((p) => p.rect)),
        text: content.replace(/\s+/gu, ' ').trim(),
        fontSize: textScale(parts, unit),
        chunks: parts,
      });
      parts = [];
      prefix = '';
      captionStart = false;
    };
    for (const chunk of chunks) {
      const previous = parts[parts.length - 1];
      if (previous) {
        const gap = chunk.rect[0] - previous.rect[2];
        const columnGap =
          gap > unit * 0.75 &&
          boundaries.some(
            (x) => x > previous.rect[2] + unit * 0.5 && x <= chunk.rect[0] + unit * 0.6,
          );
        const captionRestart =
          captionStart && gap > unit * 0.75 && documentCaptionIdentity(chunk.text);
        if (gap > cellGap || previous.hasEOL || columnGap || captionRestart) flush();
      }
      parts.push(chunk);
      if (!captionStart && prefix.length < 40) {
        prefix += (prefix ? ' ' : '') + chunk.text;
        captionStart = documentCaptionIdentity(prefix) !== null;
      }
    }
    flush();
  }
  return lines.sort((a, b) => readingOrder(a.rect, b.rect) || a.text.localeCompare(b.text));
}

function lineLeading(lines: readonly Line[], unit: number): number {
  const distances: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const a = lines[i]!;
    for (let j = i + 1; j < lines.length; j++) {
      const b = lines[j]!;
      const distance = centerY(a.rect) - centerY(b.rect);
      if (distance > unit * 2.2) break;
      if (
        distance > unit * 0.7 &&
        overlapX(a.rect, b.rect) > Math.min(width(a.rect), width(b.rect)) * 0.5
      ) {
        distances.push(distance);
        break;
      }
    }
  }
  return median(distances, unit * 1.25);
}

function sameColumn(a: DocumentRect, b: DocumentRect, unit: number): boolean {
  return (
    overlapX(a, b) >= Math.min(width(a), width(b)) * 0.5 ||
    (gapX(a, b) === 0 && Math.abs(a[0] - b[0]) <= unit)
  );
}

function proseLine(line: Line, unit: number): boolean {
  if (line.text.length < 25 || width(line.rect) < unit * 12) return false;
  const letters = line.text.match(/\p{L}/gu)?.length ?? 0;
  const numbers = line.text.match(/\p{N}/gu)?.length ?? 0;
  const words = line.text.match(/\p{L}{2,}/gu)?.length ?? 0;
  const ideographs = line.text.match(/[\u3400-\u9fff]/gu)?.length ?? 0;
  // Aligned model names and numeric measurements are table cells, not a prose paragraph.
  return letters >= numbers * 2 && (words >= 4 || ideographs >= 12);
}

function captionsFromLines(
  lines: readonly Line[],
  unit: number,
  leading: number,
  graphics: readonly DocumentRect[],
): Caption[] {
  const seeds = new Map<Line, DocumentCaptionIdentity>();
  for (const line of lines) {
    const identity = documentCaptionIdentity(line.text);
    if (identity) seeds.set(line, identity);
  }
  const proseLeading = lineLeading(
    lines.filter((line) => !seeds.has(line)),
    unit,
  );
  const separators = graphics.filter(
    (r) => valid(r) && height(r) <= unit * 0.3 && width(r) >= unit * 6,
  );
  const used = new Set<Line>();
  const captions: Caption[] = [];
  for (const [seed, identity] of seeds) {
    // An unpunctuated label followed by a sentence predicate can start a prose paragraph.
    // Require a matching body-text baseline too: the identity alone remains valid for captions.
    const paragraphReference =
      /^\s*(?:fig(?:ure)?\.?|table)\s*\S+(?<![.:：,，])\s+(?:shows?|illustrates?|summari[sz]es?|presents?|compares?|reports?|describes?|demonstrates?)\b/iu.test(
        seed.text,
      ) &&
      Math.abs(seed.fontSize - unit) <= unit * 0.05 &&
      lines.some((next) => {
        if (
          seeds.has(next) ||
          !proseLine(next, unit) ||
          Math.abs(next.fontSize - seed.fontSize) > unit * 0.05 ||
          Math.abs(next.rect[0] - seed.rect[0]) > unit ||
          !sameColumn(next.rect, seed.rect, unit)
        )
          return false;
        const distance = centerY(seed.rect) - centerY(next.rect);
        const gap = seed.rect[1] - next.rect[3];
        return (
          distance >= unit * 0.7 &&
          distance <= proseLeading * 1.35 &&
          gap >= -unit * 0.1 &&
          gap <= Math.min(unit * 0.65, proseLeading - height(seed.rect) + unit * 0.25)
        );
      });
    if (paragraphReference) continue;
    // A numbered reference on the next normal paragraph baseline is not a caption lead.
    if (
      proseLine(seed, unit) &&
      lines.some((previous) => {
        if (
          seeds.has(previous) ||
          !proseLine(previous, unit) ||
          Math.abs(previous.fontSize - seed.fontSize) > unit * 0.05 ||
          Math.abs(previous.rect[0] - seed.rect[0]) > unit ||
          !sameColumn(previous.rect, seed.rect, unit)
        )
          return false;
        const distance = centerY(previous.rect) - centerY(seed.rect);
        const gap = previous.rect[1] - seed.rect[3];
        return (
          distance >= unit * 0.7 &&
          distance <= proseLeading * 1.35 &&
          gap >= -unit * 0.1 &&
          gap <= Math.min(unit * 0.65, proseLeading - height(previous.rect) + unit * 0.25)
        );
      })
    )
      continue;
    const parts = [seed];
    used.add(seed);
    let last = seed;
    for (const line of lines) {
      if (line === seed || used.has(line) || seeds.has(line)) continue;
      if (centerY(line.rect) >= centerY(last.rect)) continue;
      const gap = last.rect[1] - line.rect[3];
      if (gap > Math.max(unit * 0.65, leading - height(last.rect) + unit * 0.2)) continue;
      if (gap < -unit * 0.2 || !sameColumn(last.rect, line.rect, unit)) continue;
      // Body prose is commonly only one point larger than a caption; a 15% tolerance crosses
      // that typography boundary and can swallow the paragraph after an otherwise valid caption.
      if (Math.abs(line.fontSize - seed.fontSize) > unit * 0.08) continue;
      // A nearby diagram's labels are not caption continuation, even at the same font size.
      if (
        graphics.some(
          (r) =>
            valid(r) &&
            width(r) >= unit * 3 &&
            height(r) >= unit * 2 &&
            contains(r, line.rect) &&
            !contains(r, seed.rect),
        )
      )
        continue;
      // Caption wrapping cannot cross a table's top rule into its header/cells.
      if (
        separators.some(
          (r) =>
            r[1] >= line.rect[3] - unit * 0.1 &&
            r[3] <= last.rect[1] + unit * 0.1 &&
            overlapX(r, seed.rect) >= Math.min(width(r), width(seed.rect)) * 0.6 &&
            overlapX(r, line.rect) >= Math.min(width(r), width(line.rect)) * 0.6,
        )
      )
        continue;
      // Continuations hang under the label or share its left edge; a paragraph indent is a boundary.
      if (
        Math.abs(line.rect[0] - seed.rect[0]) > unit * 3 &&
        Math.abs(centerX(line.rect) - centerX(seed.rect)) > unit * 2
      )
        continue;
      parts.push(line);
      used.add(line);
      last = line;
    }
    captions.push({
      identity,
      lines: parts,
      rect: bounds(parts.map((p) => p.rect)),
      text: parts.map((p) => p.text).join('\n'),
    });
  }
  return captions;
}

/** Long prose and aligned paragraph rows are barriers, not labels inside a plot. */
function bodyLines(
  lines: readonly Line[],
  captions: readonly Caption[],
  unit: number,
  leading: number,
): Set<Line> {
  const captionLines = new Set(captions.flatMap((c) => c.lines));
  const prose = lines.filter(
    (l) =>
      !captionLines.has(l) &&
      l.fontSize >= unit * 0.85 &&
      l.fontSize <= unit * 1.25 &&
      proseLine(l, unit),
  );
  const barriers = new Set(
    prose.filter(
      (line) =>
        (line.text.length >= 55 && /[.!?。！？,，;；]/u.test(line.text)) ||
        prose.some(
          (other) =>
            other !== line &&
            Math.abs(centerY(other.rect) - centerY(line.rect)) <= leading * 1.6 &&
            Math.abs(centerY(other.rect) - centerY(line.rect)) >= unit * 0.6 &&
            sameColumn(line.rect, other.rect, unit) &&
            Math.abs(line.rect[0] - other.rect[0]) <= unit * 2,
        ),
    ),
  );
  // Short final lines inherit a proved paragraph's typography and line spacing.
  for (const line of lines) {
    if (barriers.has(line) || captionLines.has(line)) continue;
    for (const previous of barriers) {
      const gap = previous.rect[1] - line.rect[3];
      if (
        gap >= -unit * 0.15 &&
        gap <= leading * 0.65 &&
        Math.abs(line.fontSize - previous.fontSize) <= unit * 0.08 &&
        Math.abs(line.rect[0] - previous.rect[0]) <= unit * 2 &&
        sameColumn(line.rect, previous.rect, unit)
      ) {
        barriers.add(line);
        break;
      }
    }
  }
  return barriers;
}

/**
 * Repeated cells can prove a table without painted rules. Reconstruct their whitespace from
 * native chunks, not merged prose lines; require multiple rows and two stable cell starts.
 * The caption bounds the search horizontally, while prose and other captions split row chains.
 */
function tableTextGroups(
  lines: readonly Line[],
  captions: readonly Caption[],
  graphics: readonly DocumentRect[],
  barriers: ReadonlySet<Line>,
  unit: number,
  leading: number,
): { rect: DocumentRect; labels: Set<Line> }[] {
  if (!captions.some((caption) => caption.identity.kind === 'table')) return [];
  const cells = textLines(
    lines.flatMap((line) => line.chunks).filter((chunk) => chunk.fontSize >= unit * 0.85),
    unit,
    unit * 0.75,
  );
  const paragraphLines = lines.filter((line) => barriers.has(line) || proseLine(line, unit));
  const chunkLines = new Map<LocalFigureText, Line>();
  for (const line of lines) for (const chunk of line.chunks) chunkLines.set(chunk, line);
  const groups: { rect: DocumentRect; labels: Set<Line> }[] = [];
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
        row.length >= 2 &&
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
    const stable = columns.filter((column) => column.rows.size >= 3);
    const supported = grid.filter(
      (row) => stable.filter((column) => column.rows.has(row)).length >= 2,
    );
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
      if (!previous || separated) chains.push([row]);
      else previous.push(row);
    }
    for (const chain of chains) {
      if (chain.length < 3) continue;
      let rect = bounds(chain.flatMap((row) => row.map((cell) => cell.rect)));
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
      )
        continue;
      groups.push({ rect: bounds([rect, ...[...labels].map((line) => line.rect)]), labels });
    }
  }
  return groups;
}

/**
 * Painted connectors can share small node labels. Other labels need an uncontested nearest
 * component; panel subcaptions may wrap, but normal prose remains a barrier.
 */
function graphicTextLabels(
  boxes: readonly DocumentRect[],
  connectors: readonly boolean[],
  lines: readonly Line[],
  captions: readonly Caption[],
  barriers: ReadonlySet<Line>,
  reserved: ReadonlySet<Line>,
  unit: number,
  leading: number,
): Set<Line>[] {
  const captionLines = new Set(captions.flatMap((caption) => caption.lines));
  const labels = boxes.map(() => new Set<Line>());
  const panelLabels = new Set<Line>();
  const barrierLines = [...barriers];
  for (const line of lines) {
    if (
      captionLines.has(line) ||
      reserved.has(line) ||
      line.fontSize > unit * 1.4 ||
      captions.some((caption) => intersects(caption.rect, line.rect))
    )
      continue;
    const panelLead = /^\([a-z]\)\s/iu.test(line.text);
    if (
      (barriers.has(line) || (line.fontSize >= unit * 0.85 && proseLine(line, unit))) &&
      !panelLead
    )
      continue;
    const candidates: { index: number; distance: number }[] = [];
    boxes.forEach((r, index) => {
      const structure = width(r) >= unit * 3 && height(r) >= unit * 2;
      const connectorLabel = connectors[index] && line.fontSize < unit * 0.85;
      if (!structure && !connectorLabel) return;
      const beside =
        gapX(r, line.rect) <= unit * 0.8 &&
        overlapY(r, line.rect) >= Math.min(height(r), height(line.rect)) * 0.25;
      const aboveBelow =
        gapY(r, line.rect) <= leading &&
        overlapX(r, line.rect) >= Math.min(width(r), width(line.rect)) * 0.5;
      if (!beside && !aboveBelow) return;
      const passage = corridor(r, line.rect);
      if (
        captions.some(
          (caption) => intersects(caption.rect, passage) || intersects(caption.rect, r),
        ) ||
        barrierLines.some(
          (other) => other !== line && !panelLabels.has(other) && intersects(other.rect, passage),
        )
      )
        return;
      if (
        connectors[index] &&
        line.fontSize < unit * 0.85 &&
        (beside || gapY(r, line.rect) <= unit * 0.3)
      )
        labels[index]!.add(line);
      if (structure) candidates.push({ index, distance: gapX(r, line.rect) + gapY(r, line.rect) });
    });
    candidates.sort((a, b) => a.distance - b.distance || a.index - b.index);
    if (!candidates.length || (candidates[1] && candidates[1].distance === candidates[0]!.distance))
      continue;
    const owner = candidates[0]!.index;
    labels[owner]!.add(line);
    if (panelLead) panelLabels.add(line);
  }
  for (const seed of panelLabels) {
    const owner = labels.findIndex((members) => members.has(seed));
    let last = seed;
    for (const line of lines) {
      if (
        centerY(line.rect) >= centerY(last.rect) ||
        captionLines.has(line) ||
        reserved.has(line) ||
        /^\([a-z]\)\s/iu.test(line.text) ||
        Math.abs(line.fontSize - seed.fontSize) > unit * 0.08 ||
        Math.abs(line.rect[0] - seed.rect[0]) > unit ||
        last.rect[1] - line.rect[3] < -unit * 0.1 ||
        last.rect[1] - line.rect[3] > unit * 0.65
      )
        continue;
      // Wrapping is anchored by the panel lead and typography, not a fixed number of lines.
      if (
        boxes.some(
          (box, index) =>
            index !== owner &&
            width(box) >= unit * 3 &&
            height(box) >= unit * 2 &&
            intersects(box, line.rect),
        )
      )
        continue;
      labels[owner]!.add(line);
      last = line;
    }
  }
  return labels;
}

function graphicsFromPage(
  page: LocalFigurePage,
  unit: number,
  leading: number,
  lines: readonly Line[],
  captions: readonly Caption[],
  barriers: ReadonlySet<Line>,
): Graphic[] {
  const pageArea = width(page.viewBox) * height(page.viewBox);
  const pageLike = (r: DocumentRect): boolean =>
    width(r) * height(r) >= pageArea * 0.8 ||
    (width(r) >= width(page.viewBox) * 0.9 && height(r) >= height(page.viewBox) * 0.85);
  const barrierLines = [...barriers];
  const seen = new Set<string>();
  const rects = page.graphics
    .filter((r) => {
      if (!valid(r) || !intersects(page.viewBox, r)) return false;
      // A scan/background/unknown operator bounding the page is not object evidence.
      if (pageLike(r)) return false;
      const key = r.join(',');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(readingOrder);
  const parents = rects.map((_, index) => index);
  const root = (index: number): number => {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]!]!;
      index = parents[index]!;
    }
    return index;
  };
  // Sweep downward: only graphics in overlapping vertical intervals need a proximity test.
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i]!;
    for (let j = i + 1; j < rects.length; j++) {
      if (rects[j]![3] < r[1] - unit * 0.35) break;
      const other = rects[j]!;
      if (gapX(r, other) > unit * 0.35 || root(i) === root(j)) continue;
      // A nearby page rule must not turn a one-column plot into a hull over the prose beside it.
      // Inspect the prospective hull before joining otherwise disconnected painted members.
      if (
        !intersects(r, other) &&
        barrierLines.some(
          (line) =>
            line.rect[0] < Math.max(r[2], other[2]) &&
            line.rect[2] > Math.min(r[0], other[0]) &&
            line.rect[1] < Math.max(r[3], other[3]) &&
            line.rect[3] > Math.min(r[1], other[1]) &&
            !intersects(line.rect, r) &&
            !intersects(line.rect, other),
        )
      )
        continue;
      parents[root(j)] = root(i);
    }
  }
  const components = new Map<number, DocumentRect[]>();
  rects.forEach((rect, index) => {
    const key = root(index);
    const members = components.get(key) ?? [];
    members.push(rect);
    components.set(key, members);
  });
  const groups = [...components.values()]
    .map((members) => ({ members, rect: bounds(members) }))
    .sort((a, b) => readingOrder(a.rect, b.rect));
  const tables = tableTextGroups(lines, captions, rects, barriers, unit, leading);
  const boxes = [...groups.map((group) => group.rect), ...tables.map((table) => table.rect)];
  const connectors = [
    ...groups.map((group) =>
      group.members.some(
        (r) =>
          // A slanted stem's axis-aligned hull is wider than its painted stroke.
          (width(r) <= unit * 0.6 && height(r) >= Math.max(unit * 1.5, width(r) * 4)) ||
          (height(r) <= unit * 0.3 && width(r) >= unit * 1.5),
      ),
    ),
    ...tables.map(() => false),
  ];
  const reserved = new Set(tables.flatMap((table) => [...table.labels]));
  const labels = graphicTextLabels(
    boxes,
    connectors,
    lines,
    captions,
    barriers,
    reserved,
    unit,
    leading,
  );
  tables.forEach((table, tableIndex) => {
    const index = groups.length + tableIndex;
    for (const line of table.labels) labels[index]!.add(line);
    groups.forEach((group, graphicIndex) => {
      const r = group.rect;
      const contained = contains(table.rect, r, unit * 0.8);
      const separator =
        height(r) <= unit * 0.3 &&
        overlapX(r, table.rect) >= width(table.rect) * 0.8 &&
        ((r[0] >= table.rect[0] - unit * 1.2 && r[2] <= table.rect[2] + unit * 1.2) ||
          groups.some(
            (other) =>
              other !== group &&
              height(other.rect) <= unit * 0.3 &&
              Math.abs(other.rect[0] - r[0]) <= unit * 0.2 &&
              Math.abs(other.rect[2] - r[2]) <= unit * 0.2 &&
              gapY(other.rect, table.rect) <= leading * 1.6 &&
              (overlapY(other.rect, table.rect) > 0 ||
                (r[1] >= table.rect[3] && other.rect[3] <= table.rect[1]) ||
                (other.rect[1] >= table.rect[3] && r[3] <= table.rect[1])),
          )) &&
        width(r) >= width(table.rect) * 0.8 &&
        gapY(r, table.rect) <= leading * 1.6;
      if (!contained && !separator) return;
      const enclosure = bounds([r, table.rect]);
      if (
        captions.some((caption) => intersects(caption.rect, enclosure)) ||
        barrierLines.some((line) => !table.labels.has(line) && intersects(line.rect, enclosure))
      )
        return;
      for (const line of table.labels) labels[graphicIndex]!.add(line);
    });
  });
  const ruleParents = boxes.map((_, index) => index);
  const ruleRoot = (index: number): number => {
    while (ruleParents[index] !== index) {
      ruleParents[index] = ruleParents[ruleParents[index]!]!;
      index = ruleParents[index]!;
    }
    return index;
  };
  // A label bridging two painted branches joins their components, not arbitrary whitespace.
  const labelOwners = new Map<Line, number>();
  labels.forEach((members, index) => {
    for (const line of members) {
      const previous = labelOwners.get(line);
      if (previous !== undefined) ruleParents[ruleRoot(index)] = ruleRoot(previous);
      else labelOwners.set(line, index);
    }
  });
  const captionLines = new Set(captions.flatMap((c) => c.lines));
  // Booktabs-style tables have disconnected horizontal rules. Join only with aligned endpoints,
  // intervening cell text, and no prose/caption barrier; empty whitespace is not table evidence.
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i]!;
    if (height(a) > unit * 0.3 || width(a) < unit * 5) continue;
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j]!;
      if (
        height(b) > unit * 0.3 ||
        Math.abs(a[0] - b[0]) > unit * 0.2 ||
        Math.abs(a[2] - b[2]) > unit * 0.2 ||
        gapY(a, b) < unit * 0.5
      )
        continue;
      const enclosure = bounds([a, b]);
      if (
        captions.some((c) => intersects(c.rect, enclosure)) ||
        barrierLines.some(
          (line) =>
            intersects(line.rect, enclosure) && !labels[i]!.has(line) && !labels[j]!.has(line),
        )
      )
        continue;
      const cells = lines.filter(
        (line) => !captionLines.has(line) && contains(enclosure, line.rect),
      );
      if (cells.length < 2) continue;
      const levels = [...new Set(cells.map((line) => centerY(line.rect)))].sort((x, y) => y - x);
      if (
        a[1] - levels[0]! > leading * 2 ||
        levels[levels.length - 1]! - b[3] > leading * 2 ||
        levels.some((level, index) => index > 0 && levels[index - 1]! - level > leading * 2)
      )
        continue;
      ruleParents[ruleRoot(j)] = ruleRoot(i);
    }
  }
  const structures = new Map<number, { rects: DocumentRect[]; labels: Set<Line> }>();
  boxes.forEach((rect, index) => {
    const key = ruleRoot(index);
    const members = structures.get(key) ?? { rects: [], labels: new Set<Line>() };
    members.rects.push(rect);
    for (const line of labels[index]!) {
      members.labels.add(line);
      members.rects.push(line.rect);
    }
    structures.set(key, members);
  });
  return [...structures.values()]
    .map((members) => ({ rect: bounds(members.rects), labels: members.labels }))
    .filter((graphic) => !pageLike(graphic.rect))
    .sort((a, b) => readingOrder(a.rect, b.rect))
    .map((graphic, index) => ({ ...graphic, index }));
}

function corridor(a: DocumentRect, b: DocumentRect): DocumentRect {
  return [Math.max(a[0], b[0]), Math.min(a[3], b[3]), Math.min(a[2], b[2]), Math.max(a[1], b[1])];
}

function bodiesForCaption(
  caption: Caption,
  captions: readonly Caption[],
  graphics: readonly Graphic[],
  lines: readonly Line[],
  barriers: ReadonlySet<Line>,
  unit: number,
  leading: number,
): Body[] {
  const above: Graphic[] = [],
    below: Graphic[] = [];
  const barrierLines = [...barriers];
  for (const graphic of graphics) {
    const r = graphic.rect;
    if (width(r) < unit * 3 || height(r) < unit * 2) continue;
    if (!sameColumn(caption.rect, r, unit)) continue;
    const direction =
      r[1] >= caption.rect[3] - unit * 0.15
        ? above
        : r[3] <= caption.rect[1] + unit * 0.15
          ? below
          : null;
    if (!direction) continue;
    // A farther row may continue a near-caption band, not annex a separate neighboring object.
    const farther = gapY(caption.rect, r) > leading * 5;
    const continuesNearBand =
      farther &&
      graphics.some(
        (nearer) =>
          nearer !== graphic &&
          gapY(caption.rect, nearer.rect) <= leading * 5 &&
          gapY(r, nearer.rect) <= unit * 1.5 &&
          sameColumn(r, nearer.rect, unit),
      );
    if (
      farther &&
      captions.some(
        (other) =>
          other !== caption &&
          (!continuesNearBand ||
            other.identity.kind !== caption.identity.kind ||
            (direction === above
              ? r[1] >= other.rect[3] - unit * 0.15
              : r[3] <= other.rect[1] + unit * 0.15)) &&
          sameColumn(other.rect, r, unit) &&
          !intersects(other.rect, r) &&
          gapY(other.rect, r) <= leading * 5,
      )
    )
      continue;
    const passage = corridor(caption.rect, r);
    if (
      barrierLines.some(
        (line) =>
          !graphic.labels.has(line) &&
          overlapX(line.rect, r) > width(line.rect) * 0.5 &&
          overlapY(line.rect, r) > height(line.rect) * 0.5,
      )
    )
      continue;
    if (
      captions.some(
        (other) =>
          other !== caption && (intersects(other.rect, passage) || intersects(other.rect, r)),
      )
    )
      continue;
    direction.push(graphic);
  }
  const bands: Graphic[][] = [];
  for (const direction of [above, below]) {
    const remaining = new Set(direction);
    for (const seed of direction) {
      if (!remaining.delete(seed)) continue;
      const connected = [seed];
      for (let i = 0; i < connected.length; i++) {
        const other = connected[i]!;
        for (const graphic of remaining) {
          if (
            overlapY(graphic.rect, other.rect) >=
              Math.min(height(graphic.rect), height(other.rect)) * 0.4 ||
            (gapY(graphic.rect, other.rect) <= unit * 1.5 &&
              sameColumn(graphic.rect, other.rect, unit))
          ) {
            remaining.delete(graphic);
            connected.push(graphic);
          }
        }
      }
      // Test a compound band's passage against all its proved labels, not only its farthest
      // panel's labels. A nearer panel subcaption is not intervening document prose.
      const band = bounds(connected.map((graphic) => graphic.rect));
      const passage = corridor(caption.rect, band);
      if (
        connected.some((graphic) => gapY(graphic.rect, caption.rect) <= leading * 5) &&
        !barrierLines.some(
          (line) =>
            (intersects(line.rect, band) || intersects(line.rect, passage)) &&
            !connected.some((graphic) => graphic.labels.has(line)),
        ) &&
        !captions.some((other) => other !== caption && intersects(other.rect, band))
      )
        bands.push(connected);
    }
  }
  // Both directions, or disconnected nearby bands, are competing hypotheses. Do not guess.
  if (bands.length !== 1) return [];
  const selected = bands[0]!.sort((a, b) => a.index - b.index);
  const allCaptionLines = new Set(captions.flatMap((c) => c.lines));
  return selected.map((graphic) => {
    const labels = lines.filter(
      (line) =>
        !allCaptionLines.has(line) &&
        (!barriers.has(line) || graphic.labels.has(line)) &&
        line.fontSize <= unit * 1.4 &&
        contains(graphic.rect, line.rect, unit * 0.8),
    );
    return {
      graphic,
      rect: bounds([graphic.rect, ...labels.map((l) => l.rect)]),
      text: labels.map((l) => l.text).join('\n'),
    };
  });
}

function region(
  id: string,
  pageIndex: number,
  kind: DocumentRegion['kind'],
  rect: DocumentRect,
  text: string,
  sourceObject?: DocumentRegion['sourceObject'],
): DocumentRegion {
  return {
    id,
    pageIndex,
    kind,
    rect,
    text,
    format: 'text',
    flow: 'auxiliary',
    anchorPrecision: 'region',
    ...(sourceObject ? { sourceObject } : {}),
  };
}

function pageTextLayout(page: LocalFigurePage): PageTextLayout | null {
  if (!valid(page.viewBox)) return null;
  const text = page.text.filter(
    (t) => t.text.trim() && valid(t.rect) && intersects(page.viewBox, t.rect),
  );
  const unit = textScale(text, Math.min(width(page.viewBox), height(page.viewBox)) / 60);
  const lines = textLines(text, unit);
  const leading = lineLeading(lines, unit);
  const captions = captionsFromLines(lines, unit, leading, page.graphics);
  return { unit, lines, leading, captions, barriers: bodyLines(lines, captions, unit, leading) };
}

function pageFigureRegions(
  pageIndex: number,
  layout: PageTextLayout,
  graphics: readonly Graphic[],
): DocumentRegion[] {
  const { captions, lines, barriers, unit, leading } = layout;
  const owners = new Map<Graphic, number>();
  const propose = (): Body[][] =>
    captions.map((caption, index) =>
      bodiesForCaption(
        caption,
        captions,
        graphics.filter((graphic) => !owners.has(graphic) || owners.get(graphic) === index),
        lines,
        barriers,
        unit,
        leading,
      ),
    );
  let proposals = propose();
  // Resolve stacked objects by uncontested single-band anchors, never by preferring a distance or
  // caption orientation. Equal competing singletons remain conflicts and are dropped below.
  for (let round = 0; round < captions.length; round++) {
    const claims = new Map<Graphic, number>();
    for (const proposal of proposals) {
      for (const body of proposal) claims.set(body.graphic, (claims.get(body.graphic) ?? 0) + 1);
    }
    let changed = false;
    proposals.forEach((proposal, index) => {
      if (proposal.some((body) => claims.get(body.graphic)! > 1)) return;
      for (const body of proposal) {
        if (!owners.has(body.graphic)) {
          owners.set(body.graphic, index);
          changed = true;
        }
      }
    });
    if (!changed) break;
    proposals = propose();
  }
  const claims = new Map<Graphic, number>();
  for (const proposal of proposals) {
    for (const body of proposal) claims.set(body.graphic, (claims.get(body.graphic) ?? 0) + 1);
  }
  const regions: DocumentRegion[] = [];
  captions.forEach((caption, index) => {
    const proposed = proposals[index]!;
    const bodies = proposed.some((body) => claims.get(body.graphic)! > 1) ? [] : proposed;
    const id = `local:${pageIndex}:caption:${index}`;
    const object = bodies.length ? { id: `object:${id}`, kind: caption.identity.kind } : undefined;
    regions.push(region(id, pageIndex, 'caption', caption.rect, caption.text, object));
    for (const body of bodies) {
      regions.push(
        region(
          `local:${pageIndex}:body:${body.graphic.index}`,
          pageIndex,
          caption.identity.kind === 'table' ? 'table' : 'image',
          body.rect,
          body.text,
          object,
        ),
      );
    }
  });
  return regions;
}

/**
 * Local, conservative caption-to-visual association in unrotated PDF user coordinates.
 * Captions survive uncertainty; bodies need painted graphics or repeated table cells and an uncontested path.
 * Inputs are never modified, and geometry ordering makes ids independent of PDF operator ordering.
 */
export function localFigureRegions(pages: readonly LocalFigurePage[]): readonly DocumentRegion[] {
  const result: DocumentRegion[] = [];
  for (const page of [...pages].sort((a, b) => a.pageIndex - b.pageIndex)) {
    const layout = pageTextLayout(page);
    if (!layout || !layout.captions.length) continue;
    const graphics = graphicsFromPage(
      page,
      layout.unit,
      layout.leading,
      layout.lines,
      layout.captions,
      layout.barriers,
    );
    result.push(...pageFigureRegions(page.pageIndex, layout, graphics));
  }
  return result;
}

function paragraphRegions(
  pageIndex: number,
  lines: readonly Line[],
  unit: number,
  leading: number,
  firstOrder: number,
): DocumentRegion[] {
  const headings = new Set(
    lines.filter((line) => {
      if (
        line.text.length > 120 ||
        line.text.split(/\s+/u).length > 18 ||
        /[.!?。！？;；]$/u.test(line.text)
      )
        return false;
      if (line.fontSize >= unit * 1.25) return true;
      if (
        line.fontSize < unit * 0.95 ||
        !/^(?:\d+(?:\.\d+)*[.)]?|[IVXLCDM]+[.)])\s+\p{L}/u.test(line.text)
      )
        return false;
      // Same-size numbered section titles need whitespace evidence as well as a short title.
      if (line.text.split(/\s+/u).length > 10) return false;
      const neighbors = lines.filter(
        (other) => other !== line && sameColumn(line.rect, other.rect, unit),
      );
      const above = neighbors.filter((other) => other.rect[1] >= line.rect[3]);
      const below = neighbors.filter((other) => other.rect[3] <= line.rect[1]);
      return (
        above.every((other) => other.rect[1] - line.rect[3] >= unit * 0.65) &&
        below.every((other) => line.rect[1] - other.rect[3] >= unit * 0.4)
      );
    }),
  );
  const paragraphs: { lines: Line[]; heading: boolean }[] = [];
  for (const line of lines) {
    const heading = headings.has(line);
    const matches = paragraphs.filter((paragraph) => {
      if (paragraph.heading !== heading) return false;
      const last = paragraph.lines[paragraph.lines.length - 1]!;
      const distance = centerY(last.rect) - centerY(line.rect);
      if (
        distance < unit * 0.55 ||
        distance > leading * 1.65 ||
        last.rect[1] - line.rect[3] >
          Math.max(unit * 0.7, leading - height(last.rect) + unit * 0.35) ||
        Math.abs(last.fontSize - line.fontSize) > unit * 0.12 ||
        !sameColumn(last.rect, line.rect, unit)
      )
        return false;
      const left = Math.min(...paragraph.lines.map((part) => part.rect[0]));
      if (heading)
        return (
          Math.abs(centerX(last.rect) - centerX(line.rect)) <= unit * 2 ||
          Math.abs(last.rect[0] - line.rect[0]) <= unit
        );
      const hanging = /^(?:[-•*]|\d+[.)])\s/u.test(paragraph.lines[0]!.text);
      return line.rect[0] <= left + unit * 0.8 || hanging;
    });
    if (matches.length === 1) matches[0]!.lines.push(line);
    else paragraphs.push({ lines: [line], heading });
  }
  return paragraphs
    .map((paragraph) => ({ ...paragraph, rect: bounds(paragraph.lines.map((line) => line.rect)) }))
    .sort((a, b) => readingOrder(a.rect, b.rect))
    .map((paragraph, index) => {
      let content = '';
      for (const line of paragraph.lines) {
        const joined =
          /[-\u00ad]$/u.test(content) ||
          (/[\u3400-\u9fff]$/u.test(content) && /^[\u3400-\u9fff]/u.test(line.text));
        content = content.replace(/\u00ad$/u, '') + (content && !joined ? ' ' : '') + line.text;
      }
      const id = `local:${pageIndex}:paragraph:${index}`;
      return {
        ...region(id, pageIndex, paragraph.heading ? 'heading' : 'text', paragraph.rect, content),
        flow: 'body' as const,
        sourceBlock: { id, order: firstOrder + index },
      };
    });
}

/**
 * Complete local digital-PDF regions: the same figure association plus geometric text paragraphs.
 * Local paragraph ids describe our reconstruction, never host/native semantic block identities.
 */
export function localDocumentRegions(pages: readonly LocalFigurePage[]): readonly DocumentRegion[] {
  const result: DocumentRegion[] = [];
  let order = 0;
  for (const page of [...pages].sort((a, b) => a.pageIndex - b.pageIndex)) {
    const layout = pageTextLayout(page);
    if (!layout) continue;
    const { unit, leading, lines, captions, barriers } = layout;
    const graphics = graphicsFromPage(page, unit, leading, lines, captions, barriers);
    const objects = pageFigureRegions(page.pageIndex, layout, graphics);
    const barrierLines = [...barriers];
    // Uncaptioned visual clusters can still contain diagram labels. Do not turn those labels into
    // prose, but retain ordinary paragraph evidence inside a border/background rectangle.
    const diagramBounds = graphics.filter(
      (graphic) =>
        width(graphic.rect) >= unit * 3 &&
        height(graphic.rect) >= unit * 2 &&
        !barrierLines.some(
          (line) => intersects(line.rect, graphic.rect) && !graphic.labels.has(line),
        ),
    );
    const remaining = lines.filter(
      (line) =>
        !objects.some(
          (object) =>
            overlapX(object.rect, line.rect) >= width(line.rect) * 0.5 &&
            overlapY(object.rect, line.rect) >= height(line.rect) * 0.5,
        ) &&
        !diagramBounds.some(
          (graphic) => line.fontSize <= unit * 1.4 && contains(graphic.rect, line.rect, unit * 0.8),
        ),
    );
    const paragraphs = paragraphRegions(page.pageIndex, remaining, unit, leading, order);
    order += paragraphs.length;
    result.push(...objects, ...paragraphs);
  }
  return result;
}
