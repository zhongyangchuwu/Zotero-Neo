import { documentCaptionIdentity } from './caption-identity';
import { bounds, centerY, gapX, height, median, overlapX, readingOrder, width } from './geometry';
import type { Line, LocalFigureText, LocalRuleRect, TextRow } from './types';

/** Character weighting prevents a handful of headings or plot ticks setting the body scale. */
export function textScale(text: readonly LocalFigureText[], fallback: number): number {
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
export function columnBoundaries(rows: readonly TextRow[], unit: number): number[] {
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

/** Different text scales share a track only at a local attachment, such as a math script. */
function compatibleTypography(a: LocalFigureText, b: LocalFigureText): boolean {
  const smaller = Math.min(a.fontSize, b.fontSize);
  const larger = Math.max(a.fontSize, b.fontSize);
  return larger <= smaller * 1.5 || gapX(a.rect, b.rect) <= larger * 0.5;
}

/** Build visual rows, then split column/cell gaps instead of trusting PDF content-stream order. */
export function textLines(
  text: readonly LocalFigureText[],
  unit: number,
  cellGap = unit * 2.5,
): Line[] {
  const rows: TextRow[] = [];
  for (const chunk of [...text].sort(
    (a, b) => readingOrder(a.rect, b.rect) || a.text.localeCompare(b.text),
  )) {
    let row: (typeof rows)[number] | undefined;
    let fontDifference = Infinity;
    for (let i = rows.length - 1; i >= 0; i--) {
      const candidate = rows[i]!;
      if (candidate.rect[1] > chunk.rect[3] + unit) break;
      if (
        Math.abs(centerY(candidate.rect) - centerY(chunk.rect)) <=
        Math.min(height(chunk.rect), height(candidate.rect)) * 0.4
      ) {
        // A script can be encountered before its base, so visual rows may contain
        // mixed sizes. Prefer a matching size over a coincident neighboring tick row.
        let difference = Infinity;
        for (const other of candidate.chunks)
          difference = Math.min(difference, Math.abs(other.fontSize - chunk.fontSize));
        if (!row || difference < fontDifference) {
          row = candidate;
          fontDifference = difference;
        }
        if (fontDifference === 0) break;
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
  const runs: LocalFigureText[][] = [];
  for (const row of rows) {
    const tracks: LocalFigureText[][] = [];
    for (const chunk of row.chunks) {
      let best: LocalFigureText[] | undefined;
      let fontDifference = Infinity;
      for (const track of tracks) {
        const previous = track[track.length - 1]!;
        // Overprinted text streams are not consecutive words. Keep both, without
        // treating either stream as invisible; small kerning overlaps remain legal.
        if (chunk.rect[0] < previous.rect[2] - unit * 0.2) continue;
        // A distant matching font must not steal a locally attached math script.
        if (chunk.rect[0] - previous.rect[2] > cellGap) continue;
        if (!compatibleTypography(previous, chunk)) continue;
        const difference = Math.abs(chunk.fontSize - previous.fontSize);
        // A long run that overprints this track's later words starts another stream,
        // even when its left edge happens to fit after the current prefix.
        if (
          difference > Math.min(chunk.fontSize, previous.fontSize) * 0.08 &&
          width(chunk.rect) >= unit * 6 &&
          row.chunks.some(
            (other) =>
              other !== chunk &&
              Math.abs(other.fontSize - previous.fontSize) <= unit * 0.05 &&
              overlapX(other.rect, chunk.rect) > unit * 0.2,
          )
        )
          continue;
        if (difference < fontDifference) {
          best = track;
          fontDifference = difference;
        }
      }
      if (best) best.push(chunk);
      else tracks.push([chunk]);
    }
    runs.push(...tracks);
  }
  for (const chunks of runs) {
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

export function lineLeading(lines: readonly Line[], unit: number): number {
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

export function sameColumn(a: LocalRuleRect, b: LocalRuleRect, unit: number): boolean {
  return (
    overlapX(a, b) >= Math.min(width(a), width(b)) * 0.5 ||
    (gapX(a, b) === 0 && Math.abs(a[0] - b[0]) <= unit)
  );
}

export function proseLine(line: Line, unit: number): boolean {
  if (line.text.length < 25 || width(line.rect) < unit * 12) return false;
  const letters = line.text.match(/\p{L}/gu)?.length ?? 0;
  const numbers = line.text.match(/\p{N}/gu)?.length ?? 0;
  const words = line.text.match(/\p{L}{2,}/gu)?.length ?? 0;
  const ideographs = line.text.match(/[\u3400-\u9fff]/gu)?.length ?? 0;
  // Aligned model names and numeric measurements are table cells, not a prose paragraph.
  return letters >= numbers * 2 && (words >= 4 || ideographs >= 12);
}
