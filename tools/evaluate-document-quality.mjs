#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import {
  assert,
  json,
  loadCorpus,
  nonempty,
  options,
  protectOutputs,
  shaPattern,
  validRect,
} from './document-quality-common.mjs';

const kinds = ['text', 'object', 'reference', 'citation', 'reading-order'];
const statuses = ['completed', 'failed', 'unsupported', 'not-performed'];
const taskStatuses = ['passed', 'failed', 'unsupported', 'not-performed'];
const modes = ['cold', 'warm', 'cache'];
const objectIoUThreshold = 0.5;
const normalized = (value) =>
  value
    .normalize('NFKC')
    .replace(/\u00ad/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
const contains = (haystack, needle) => normalized(haystack).includes(normalized(needle));
const uniqueIds = (items, context) => {
  const ids = new Set();
  for (const item of items) {
    assert(item && nonempty(item.id) && !ids.has(item.id), `Invalid or duplicate ${context} id`);
    ids.add(item.id);
  }
  return ids;
};
function location(value) {
  return (
    value &&
    Number.isInteger(value.pageIndex) &&
    value.pageIndex >= 0 &&
    Array.isArray(value.rects) &&
    value.rects.length > 0 &&
    value.rects.every(validRect) &&
    (value.nextPageRects === undefined ||
      (Array.isArray(value.nextPageRects) && value.nextPageRects.every(validRect)))
  );
}
function validateParsed(parsed, observation) {
  assert(
    parsed &&
      parsed.schemaVersion === 1 &&
      nonempty(parsed.sourceFingerprint) &&
      parsed.backend === observation.backend &&
      parsed.modelRevision === observation.modelRevision &&
      Number.isFinite(parsed.durationMs) &&
      parsed.durationMs >= 0 &&
      Array.isArray(parsed.pages) &&
      parsed.pages.length > 0 &&
      Array.isArray(parsed.regions) &&
      parsed.regions.length > 0,
    'Invalid parsed document identity or shape',
  );
  const pages = new Set();
  for (const page of parsed.pages) {
    assert(
      page &&
        Number.isInteger(page.pageIndex) &&
        page.pageIndex >= 0 &&
        !pages.has(page.pageIndex) &&
        validRect(page.viewBox) &&
        [0, 90, 180, 270].includes(page.rotation),
      'Invalid parsed page',
    );
    pages.add(page.pageIndex);
  }
  uniqueIds(parsed.regions, 'region');
  for (const region of parsed.regions) {
    assert(
      pages.has(region.pageIndex) &&
        validRect(region.rect) &&
        typeof region.text === 'string' &&
        [
          'text',
          'heading',
          'caption',
          'image',
          'table',
          'formula',
          'list',
          'code',
          'footnote',
          'references',
          'header',
          'footer',
          'other',
        ].includes(region.kind) &&
        ['text', 'html', 'latex', 'markdown'].includes(region.format) &&
        ['body', 'auxiliary', 'excluded'].includes(region.flow) &&
        region.anchorPrecision === 'region',
      'Invalid parsed region',
    );
    if (region.sourceBlock !== undefined)
      assert(
        nonempty(region.sourceBlock?.id) &&
          Number.isInteger(region.sourceBlock.order) &&
          region.sourceBlock.order >= 0,
        'Invalid source block',
      );
    if (region.sourceObject !== undefined)
      assert(
        nonempty(region.sourceObject?.id) && ['figure', 'table'].includes(region.sourceObject.kind),
        'Invalid source object',
      );
  }
}
function validateObjectGroups(groups, parsed) {
  assert(parsed && Array.isArray(groups), 'Object groups require a parsed document');
  uniqueIds(groups, 'object group');
  const regions = new Map(parsed.regions.map((region) => [region.id, region]));
  for (const group of groups) {
    assert(
      ['figure', 'table'].includes(group.kind) &&
        typeof group.label === 'string' &&
        typeof group.title === 'string' &&
        ['backend', 'geometry', 'caption-only', 'ambiguous'].includes(group.association) &&
        Array.isArray(group.memberRegionIds) &&
        Array.isArray(group.captionRegionIds) &&
        new Set(group.memberRegionIds).size === group.memberRegionIds.length &&
        new Set(group.captionRegionIds).size === group.captionRegionIds.length &&
        group.memberRegionIds.every((id) => regions.has(id)) &&
        group.captionRegionIds.every(
          (id) => group.memberRegionIds.includes(id) && regions.get(id)?.kind === 'caption',
        ),
      'Invalid object group',
    );
  }
}
function validateReferences(refs) {
  assert(
    refs && Array.isArray(refs.entries) && Array.isArray(refs.occurrences),
    'Invalid references',
  );
  if (refs.bibliographyCoverage !== undefined)
    assert(nonempty(refs.bibliographyCoverage), 'Invalid bibliography coverage');
  const ids = uniqueIds(refs.entries, 'reference');
  uniqueIds(refs.occurrences, 'occurrence');
  for (const entry of refs.entries) {
    assert(typeof entry.text === 'string' && location(entry.location), 'Invalid reference entry');
    if (entry.label !== undefined)
      assert(typeof entry.label === 'string', 'Invalid reference label');
    for (const key of ['doi', 'arxivID'])
      if (entry[key] != null) assert(nonempty(entry[key]), `Invalid reference ${key}`);
  }
  for (const occurrence of refs.occurrences)
    assert(
      typeof occurrence.text === 'string' &&
        location(occurrence.location) &&
        Array.isArray(occurrence.referenceIDs) &&
        new Set(occurrence.referenceIDs).size === occurrence.referenceIDs.length &&
        occurrence.referenceIDs.every((id) => ids.has(id)),
      'Invalid citation occurrence',
    );
}
function validateObservations(input, docs) {
  assert(
    input &&
      input.schemaVersion === 1 &&
      input.run &&
      ['id', 'sourceCommit', 'host', 'startedAt'].every((k) => nonempty(input.run[k])) &&
      Number.isFinite(Date.parse(input.run.startedAt)) &&
      Array.isArray(input.observations),
    'Invalid run',
  );
  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  const seen = new Set();
  for (const obs of input.observations) {
    const doc = byId.get(obs?.documentId);
    assert(
      doc &&
        nonempty(obs.backend) &&
        modes.includes(obs.mode) &&
        statuses.includes(obs.status) &&
        shaPattern.test(obs.pdfSha256) &&
        obs.pdfSha256.toLowerCase() === doc.pdf.sha256.toLowerCase() &&
        nonempty(obs.adapterVersion) &&
        (obs.modelRevision === null || nonempty(obs.modelRevision)),
      'Invalid observation identity or PDF hash',
    );
    const key = JSON.stringify([obs.documentId, obs.backend, obs.mode]);
    assert(!seen.has(key), `Duplicate observation: ${key}`);
    seen.add(key);
    if (obs.durationMs !== undefined)
      assert(Number.isFinite(obs.durationMs) && obs.durationMs >= 0, 'Invalid duration');
    if (obs.failure !== undefined) assert(nonempty(obs.failure), 'Invalid failure detail');
    if (obs.status === 'failed')
      assert(nonempty(obs.failure), 'Failed observation requires a failure reason');
    if (obs.parsed !== undefined) {
      assert(obs.status === 'completed', 'Non-completed observation cannot contain parsed data');
      validateParsed(obs.parsed, obs);
    }
    if (obs.objectGroups !== undefined) validateObjectGroups(obs.objectGroups, obs.parsed);
    if (obs.references !== undefined) {
      assert(obs.status === 'completed', 'Non-completed observation cannot contain references');
      validateReferences(obs.references);
    }
    if (obs.taskOutcomes !== undefined) {
      assert(Array.isArray(obs.taskOutcomes), 'Invalid task outcomes');
      const checked = new Set();
      for (const task of obs.taskOutcomes) {
        assert(
          task &&
            doc.checks.some((check) => check.id === task.checkId) &&
            !checked.has(task.checkId) &&
            taskStatuses.includes(task.status) &&
            (task.detail === undefined || nonempty(task.detail)),
          'Invalid or duplicate task outcome',
        );
        checked.add(task.checkId);
      }
    }
  }
}
function iou(a, b) {
  const area = (r) => (r[2] - r[0]) * (r[3] - r[1]);
  const intersection =
    Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) *
    Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  return intersection / (area(a) + area(b) - intersection);
}
function overlaps(a, b) {
  return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
}
function locationResources(item, items, prefix) {
  return items
    .filter(
      (other) =>
        other.location.pageIndex === item.location.pageIndex &&
        item.location.rects.some((rect) =>
          other.location.rects.some((otherRect) => overlaps(rect, otherRect)),
        ),
    )
    .map((other) => `${prefix}:${other.id}`);
}
function referenceMatches(entry, check) {
  if (check.doi && normalized(entry.doi ?? '') !== normalized(check.doi)) return false;
  if (check.arxivID && normalized(entry.arxivID ?? '') !== normalized(check.arxivID)) return false;
  return !check.referenceText || contains(entry.text, check.referenceText);
}
function textCandidates(regions, text) {
  const needle = normalized(text);
  const body = regions.filter((region) => region.flow === 'body');
  const occurrences = (value) => {
    const positions = [];
    for (let from = 0; ; ) {
      const position = value.indexOf(needle, from);
      if (position < 0) return positions;
      positions.push(position);
      from = position + 1;
    }
  };
  return body.flatMap((region) => {
    const value = normalized(region.text);
    return occurrences(value).map((start) => ({
      resources: [],
      textSpans: body
        .filter((other) => overlaps(region.rect, other.rect))
        .flatMap((other) => {
          const otherText = normalized(other.text);
          const positions =
            other.id === region.id || otherText === value ? [start] : occurrences(otherText);
          return positions.map((position) => ({
            id: other.id,
            start: position,
            end: position + needle.length,
          }));
        }),
    }));
  });
}
function candidates(check, obs) {
  if (check.kind === 'reference')
    return obs.references.entries
      .filter(
        (entry) =>
          entry.location.pageIndex === check.pageIndex &&
          contains(entry.text, check.text) &&
          referenceMatches(entry, check),
      )
      .map((entry) => ({ resources: locationResources(entry, obs.references.entries, 'ref') }));
  if (check.kind === 'citation')
    return obs.references.occurrences
      .filter(
        (occ) =>
          occ.location.pageIndex === check.pageIndex &&
          contains(occ.text, check.text) &&
          (!(check.doi || check.arxivID || check.referenceText) ||
            occ.referenceIDs.some((id) =>
              referenceMatches(
                obs.references.entries.find((entry) => entry.id === id),
                check,
              ),
            )),
      )
      .map((occ) => ({
        resources: locationResources(occ, obs.references.occurrences, 'citation'),
      }));
  const regions = obs.parsed.regions.filter((region) => region.pageIndex === check.pageIndex);
  const regionResources = (region) =>
    regions
      .filter((other) => overlaps(region.rect, other.rect))
      .map((other) => `region:${other.id}`);
  if (check.kind === 'text') return textCandidates(regions, check.text);
  if (check.kind === 'object') {
    if (check.objectKind === 'formula')
      return regions
        .filter((region) => region.kind === 'formula' && contains(region.text, check.text))
        .map((region) => ({ resources: regionResources(region), rect: region.rect }));
    const bodies = regions.filter(
      (region) =>
        region.kind === 'image' || (check.objectKind === 'table' && region.kind === 'table'),
    );
    const captions = regions.filter(
      (region) =>
        region.kind === 'caption' && (check.captionRect || contains(region.text, check.text)),
    );
    const groupedCandidate = (groupBodies, groupCaptions) => {
      if (!groupBodies.length || !groupCaptions.length) return [];
      const rect = [
        Math.min(...groupBodies.map((body) => body.rect[0])),
        Math.min(...groupBodies.map((body) => body.rect[1])),
        Math.max(...groupBodies.map((body) => body.rect[2])),
        Math.max(...groupBodies.map((body) => body.rect[3])),
      ];
      const captionRect = [
        Math.min(...groupCaptions.map((caption) => caption.rect[0])),
        Math.min(...groupCaptions.map((caption) => caption.rect[1])),
        Math.max(...groupCaptions.map((caption) => caption.rect[2])),
        Math.max(...groupCaptions.map((caption) => caption.rect[3])),
      ];
      if (check.captionRect && iou(check.captionRect, captionRect) < objectIoUThreshold) return [];
      return [
        {
          resources: [...groupBodies, ...groupCaptions].flatMap(regionResources),
          rect,
          captionRect,
        },
      ];
    };
    if (obs.objectGroups !== undefined) {
      return obs.objectGroups
        .filter(
          (group) =>
            group.kind === check.objectKind && ['backend', 'geometry'].includes(group.association),
        )
        .flatMap((group) => {
          const members = regions.filter((region) => group.memberRegionIds.includes(region.id));
          const groupBodies = bodies.filter((region) => members.includes(region));
          const groupCaptions = captions.filter((region) =>
            group.captionRegionIds.includes(region.id),
          );
          return groupedCandidate(groupBodies, groupCaptions);
        });
    }
    const sourceIds = new Set(
      bodies
        .filter((body) => body.sourceObject?.kind === check.objectKind)
        .map((body) => body.sourceObject.id),
    );
    return [...sourceIds].flatMap((id) =>
      groupedCandidate(
        bodies.filter(
          (body) => body.sourceObject?.kind === check.objectKind && body.sourceObject.id === id,
        ),
        captions.filter(
          (caption) =>
            caption.sourceObject?.kind === check.objectKind && caption.sourceObject.id === id,
        ),
      ),
    );
  }
  // Region array order is the parser's reading order; no geometric reordering is inferred.
  const selected = [];
  let start = 0,
    offset = 0;
  for (const part of check.sequence) {
    let found = false;
    for (let i = start; i < regions.length; i++) {
      const region = regions[i];
      if (
        region.flow !== 'body' ||
        selected.some(
          (previous) => previous.id !== region.id && overlaps(previous.rect, region.rect),
        )
      )
        continue;
      const needle = normalized(part);
      const position = normalized(region.text).indexOf(needle, i === start ? offset : 0);
      if (position < 0) continue;
      if (!selected.includes(region)) selected.push(region);
      start = i;
      offset = position + needle.length;
      found = true;
      break;
    }
    if (!found) return [];
  }
  return [{ resources: selected.flatMap(regionResources) }];
}
function evaluateObservation(doc, obs) {
  const used = new Set();
  const usedTextSpans = [];
  const checks = doc.checks.map((check) => {
    let reason;
    if (obs.status !== 'completed') reason = obs.failure || `observation-${obs.status}`;
    else if (['reference', 'citation'].includes(check.kind) ? !obs.references : !obs.parsed)
      reason = ['reference', 'citation'].includes(check.kind)
        ? 'references-not-provided'
        : 'parsed-document-not-provided';
    else if (
      !['reference', 'citation'].includes(check.kind) &&
      !obs.parsed.pages.some((page) => page.pageIndex === check.pageIndex)
    )
      reason = 'parsed-page-not-provided';
    const result = {
      checkId: check.id,
      kind: check.kind,
      static: null,
      reason: reason ?? null,
      iou: null,
      iouReason: check.rect ? (reason ?? 'no-matched-object') : 'annotation-rectangle-not-provided',
      ...(check.captionRect ? { captionIoU: null } : {}),
      staticEvidence:
        check.kind === 'object'
          ? check.rect
            ? 'caption-and-object-box'
            : 'localization-only'
          : null,
      task: obs.taskOutcomes?.find((task) => task.checkId === check.id) ?? {
        checkId: check.id,
        status: 'not-performed',
        detail: 'No actual task outcome provided',
      },
    };
    if (!reason) {
      const matches = candidates(check, obs);
      const available = matches.filter(
        (candidate) =>
          candidate.resources.every((resource) => !used.has(`${check.kind}:${resource}`)) &&
          (candidate.textSpans ?? []).every(
            (span) =>
              !usedTextSpans.some(
                (usedSpan) =>
                  span.id === usedSpan.id && span.start < usedSpan.end && usedSpan.start < span.end,
              ),
          ),
      );
      let match = available[0];
      if (check.kind === 'object' && check.rect && available.length) {
        match = available.reduce((best, candidate) =>
          iou(check.rect, candidate.rect) > iou(check.rect, best.rect) ? candidate : best,
        );
      }
      result.static = Boolean(match);
      if (match) {
        for (const resource of match.resources) used.add(`${check.kind}:${resource}`);
        if (match.textSpans) usedTextSpans.push(...match.textSpans);
        if (check.kind === 'object' && check.rect && match.rect) {
          result.iou = iou(check.rect, match.rect);
          result.iouReason = null;
          result.static = result.iou >= objectIoUThreshold;
          if (check.captionRect && match.captionRect) {
            result.captionIoU = iou(check.captionRect, match.captionRect);
            result.static = result.static && result.captionIoU >= objectIoUThreshold;
            if (result.captionIoU < objectIoUThreshold)
              result.reason = 'caption-iou-below-threshold';
          }
          if (result.iou < objectIoUThreshold) result.reason = 'object-iou-below-threshold';
        }
      } else if (matches.length) result.reason = 'candidate-already-used-by-another-check';
    }
    if (check.kind !== 'object') result.iouReason = 'not-an-object-check';
    return result;
  });
  return {
    documentId: obs.documentId,
    backend: obs.backend,
    mode: obs.mode,
    status: obs.status,
    adapterVersion: obs.adapterVersion,
    modelRevision: obs.modelRevision,
    pdfSha256: obs.pdfSha256,
    durationMs: obs.durationMs ?? null,
    failure: obs.failure ?? null,
    bibliographyCoverage: obs.references?.bibliographyCoverage ?? null,
    checks,
  };
}
function summarize(results) {
  const statusCounts = Object.fromEntries(statuses.map((status) => [status, 0]));
  const taskCounts = Object.fromEntries(taskStatuses.map((status) => [status, 0]));
  const taskUnmeasuredReasons = {};
  const metrics = Object.fromEntries(
    kinds.map((kind) => [kind, { passed: 0, measured: 0, notMeasured: 0, reasons: {} }]),
  );
  let iouMeasured = 0,
    iouSum = 0,
    iouNotMeasured = 0;
  const iouReasons = {};
  for (const result of results) {
    statusCounts[result.status]++;
    for (const check of result.checks) {
      taskCounts[check.task.status]++;
      if (['unsupported', 'not-performed'].includes(check.task.status)) {
        const reason = check.task.detail || `task-${check.task.status}`;
        taskUnmeasuredReasons[reason] = (taskUnmeasuredReasons[reason] ?? 0) + 1;
      }
      const metric = metrics[check.kind];
      if (check.static === null) {
        metric.notMeasured++;
        metric.reasons[check.reason] = (metric.reasons[check.reason] ?? 0) + 1;
      } else {
        metric.measured++;
        if (check.static) metric.passed++;
      }
      if (check.kind === 'object') {
        if (check.iou === null) {
          iouNotMeasured++;
          iouReasons[check.iouReason] = (iouReasons[check.iouReason] ?? 0) + 1;
        } else {
          iouMeasured++;
          iouSum += check.iou;
        }
      }
    }
  }
  return {
    observations: results.length,
    statuses: statusCounts,
    selectedChecks: metrics,
    actualTaskOutcomes: taskCounts,
    taskUnmeasuredReasons,
    objectIoU: {
      measured: iouMeasured,
      notMeasured: iouNotMeasured,
      mean: iouMeasured ? iouSum / iouMeasured : null,
      reasons: iouReasons,
    },
  };
}
function markdown(report) {
  const lines = [
    '# 文档质量评测',
    '',
    `运行：${report.run.id}；语料文档：${report.corpusDocuments}；观测：${report.summary.observations}；未观测文档：${report.unobservedDocuments.length}。`,
    '',
    '仅统计选定核验点，非全文精确率或召回率；标注来源以清单为准，代理核对不等于额外人工复审。静态匹配不代表端到端任务成功。',
    '',
    '## 观测状态',
    '',
    ...Object.entries(report.summary.statuses).map(([key, value]) => `- ${key}: ${value}`),
    '',
    '## 选定核验点',
    '',
    ...Object.entries(report.summary.selectedChecks).map(
      ([key, value]) =>
        `- ${key}: ${value.passed}/${value.measured}；未测 ${value.notMeasured} (${JSON.stringify(value.reasons)})`,
    ),
    '',
    `对象 IoU：已测 ${report.summary.objectIoU.measured}，未测 ${report.summary.objectIoU.notMeasured}，均值 ${report.summary.objectIoU.mean ?? '未测'}；原因 ${JSON.stringify(report.summary.objectIoU.reasons)}。`,
    '',
    '## 实际任务结果（独立于静态匹配）',
    '',
    ...Object.entries(report.summary.actualTaskOutcomes).map(
      ([key, value]) => `- ${key}: ${value}`,
    ),
    '',
    '## 模式与后端',
    '',
    ...report.groups.map(
      (group) =>
        `- ${group.backend} / ${group.mode}: ${group.summary.observations} 次，状态 ${JSON.stringify(group.summary.statuses)}；核验 ${JSON.stringify(group.summary.selectedChecks)}；任务 ${JSON.stringify(group.summary.actualTaskOutcomes)}`,
    ),
    '',
    `未观测文档：${report.unobservedDocuments.join(', ') || '无'}`,
    '',
  ];
  lines.push(
    `标注框对象要求主体 IoU ≥ ${report.objectIoUThreshold}，另有 captionRect 时还要求题注 IoU ≥ ${report.objectIoUThreshold}；无框核验不能证明主体/题注关联正确。`,
    '',
  );
  lines.push(
    `未观测文档的核验点（未执行）：${JSON.stringify(report.unobservedChecks)}。`,
    `实际任务未测原因：${JSON.stringify(report.summary.taskUnmeasuredReasons)}。`,
    '',
  );
  return lines.join('\n');
}
try {
  const args = options(
    process.argv.slice(2),
    ['corpus'],
    ['observations', 'output', 'markdown'],
    ['corpus', 'observations', 'output'],
  );
  protectOutputs([...args.corpus, args.observations], [args.output, args.markdown]);
  const docs = loadCorpus(args.corpus);
  const input = json(args.observations);
  validateObservations(input, docs);
  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  const results = input.observations.map((obs) =>
    evaluateObservation(byId.get(obs.documentId), obs),
  );
  const groups = [];
  for (const backend of [...new Set(results.map((result) => result.backend))].sort())
    for (const mode of modes) {
      const selected = results.filter(
        (result) => result.backend === backend && result.mode === mode,
      );
      groups.push({ backend, mode, summary: summarize(selected) });
    }
  const observed = new Set(results.map((result) => result.documentId));
  const unobserved = docs.filter((doc) => !observed.has(doc.id));
  const report = {
    schemaVersion: 1,
    run: input.run,
    corpusDocuments: docs.length,
    corpus: docs,
    unobservedDocuments: unobserved.map((doc) => doc.id),
    unobservedChecks: Object.fromEntries(
      kinds.map((kind) => [
        kind,
        unobserved.reduce(
          (count, doc) => count + doc.checks.filter((check) => check.kind === kind).length,
          0,
        ),
      ]),
    ),
    objectIoUThreshold,
    limitations: [
      'Selected source-verified checks only; not exhaustive precision or recall.',
      'Static matches do not establish end-to-end task success.',
      'PDF hashes are compared to observation metadata; the evaluator does not read PDF bytes.',
      'Object caption matches use provided object groups or explicit same-page provider membership; no geometry is inferred by this evaluator.',
      'Without an annotated object rectangle, a match establishes localization only, not caption association correctness.',
    ],
    summary: summarize(results),
    groups,
    observations: results,
  };
  writeFileSync(args.output, `${JSON.stringify(report, null, 2)}\n`);
  if (args.markdown) writeFileSync(args.markdown, markdown(report));
} catch (error) {
  console.error(`[document-quality] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
