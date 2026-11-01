import { openReadingRecords } from './records.js';

const $ = (id) => document.getElementById(id);
const labels = {
  p46: '多分辨率的需求',
  p47: '多模式设计',
  p48: '原生分辨率',
  p52: '动态分辨率',
  p53: '训练配置',
  table1: 'Table 1',
  equation1: '公式 1',
};
const kindLabels = { summary: '章节解读', question: '已存问答', translation: '已存译文' };

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function start() {
  const response = await fetch('./document.json');
  if (!response.ok) throw new Error('Sample document unavailable');
  const data = await response.json();
  const store = openReadingRecords(data);
  const sources = new Map(
    [...data.blocks, data.table, data.equation].map((source) => [source.id, source]),
  );
  const ui = {
    mode: 'read',
    target: store.state.view.target,
    scope: 'all',
    filter: 'all',
    focusedRecord: null,
    editing: null,
    page: sources.get(store.state.view.target).page,
    zoom: 1,
  };
  let toastTimer;
  let highlightTimer;
  let pdfRevision = 0;
  let pdfFocusTimer;
  let navigationUntil = 0;
  let scrollFrame = null;
  let viewSaveTimer;

  function announce(message) {
    $('toast').textContent = message;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ($('toast').hidden = true), 2600);
  }

  function savedStatus() {
    $('save-state').textContent = store.error || '✓ 阅读记录已存本机';
  }

  function saveView(patch) {
    store.setView(patch);
    savedStatus();
  }

  function button(text, action, className = 'text-button') {
    const node = element('button', className, text);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  }

  function recordByID(id) {
    return store.state.records.find((record) => record.id === id);
  }

  function updateCurrent(target, persist = true) {
    ui.target = target;
    for (const node of document.querySelectorAll('[data-source-id]'))
      node.classList.toggle('current', node.dataset.sourceId === target);
    for (const node of document.querySelectorAll('.outline-children [data-target]'))
      node.setAttribute('aria-current', String(node.dataset.target === target));
    $('location-label').textContent = `${labels[target]} · 原文第 ${sources.get(target).page} 页`;
    if (persist) {
      clearTimeout(viewSaveTimer);
      viewSaveTimer = setTimeout(() => saveView({ target }), 180);
    }
    if (!ui.editing && ui.scope === 'current') renderRecords();
  }

  function readingTarget(id) {
    return document.querySelector(`[data-source-id="${id}"]`);
  }

  /** Keep desktop navigation inside the reading pane; mobile uses the document's single scrolling column. */
  function goToReading(id, flash = true) {
    const node = readingTarget(id);
    if (!node) return;
    const details = node.closest('details');
    if (details) details.open = true;
    navigationUntil = performance.now() + 800;
    updateCurrent(id);
    if (matchMedia('(max-width: 700px)').matches) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      const reader = $('reader-scroll');
      reader.scrollTo({
        top:
          reader.scrollTop +
          node.getBoundingClientRect().top -
          reader.getBoundingClientRect().top -
          (reader.clientHeight - node.offsetHeight) / 2,
        behavior: 'smooth',
      });
    }
    if (flash) {
      document
        .querySelectorAll('.source-block.flash')
        .forEach((item) => item.classList.remove('flash'));
      node.classList.add('flash');
      clearTimeout(highlightTimer);
      highlightTimer = setTimeout(() => node.classList.remove('flash'), 1800);
    }
  }

  function showRecord(id) {
    if (ui.editing) {
      announce('请先保存或取消正在编辑的解读');
      return;
    }
    ui.scope = 'all';
    ui.filter = 'all';
    ui.focusedRecord = id;
    setMode('read');
    renderRecords();
    const card = document.querySelector(`[data-record-id="${id}"]`);
    if (card) {
      const records = $('records');
      records.scrollTo({
        top:
          records.scrollTop +
          card.getBoundingClientRect().top -
          records.getBoundingClientRect().top,
        behavior: 'smooth',
      });
    }
    card?.focus({ preventScroll: true });
  }

  function toggleTranslation(id) {
    const content = $(`translation-${id}`);
    content.hidden = !content.hidden;
    const control = document.querySelector(`[data-translation-target="${id}"]`);
    control?.setAttribute('aria-expanded', String(!content.hidden));
  }

  function renderTranslations() {
    for (const record of store.state.records.filter((item) => item.kind === 'translation')) {
      const target = record.targets[0];
      const node = $(`translation-${target}`);
      if (!node) continue;
      node.querySelector('p').textContent = record.text;
      node.querySelector('.translation-status').textContent = record.edited
        ? '已编辑 · 已存'
        : '预置译文 · 已存';
      node.hidden = !store.state.view.translations;
      document
        .querySelector(`[data-translation-target="${target}"]`)
        ?.setAttribute('aria-expanded', String(!node.hidden));
    }
  }

  function renderSummary() {
    const summary = recordByID('summary');
    $('summary-content').replaceChildren(
      ...summary.text
        .split('\n')
        .filter(Boolean)
        .map((line) => element('p', '', line)),
    );
    $('summary-inline').hidden = !store.state.view.insights;
    $('summary-inline').open = store.state.view.summaryOpen;
    $('summary-inline').querySelector('.saved-label').textContent = summary.edited
      ? '已编辑'
      : '已存';
  }

  function sourceFigure(source, title, related = false) {
    const figure = element('figure', 'source-figure');
    figure.dataset.sourceId = source.id;
    const image = element('img');
    image.src = source.image;
    image.alt = title;
    image.width = source.id === 'table1' ? 950 : 1190;
    image.height = source.id === 'table1' ? 280 : 68;
    const caption = element('figcaption');
    caption.append(
      element('span', '', title),
      button(`对照第 ${source.page} 页 ↗`, () => compareSource(source.id)),
    );
    figure.append(image, caption);
    if (!related) return figure;
    const details = element('details', 'related-table');
    details.append(element('summary', '', '相关表格 · Table 1 分辨率与 token 数'), figure);
    return details;
  }

  function renderDocument() {
    const blocks = $('reading-blocks');
    for (const source of data.blocks) {
      const block = element('section', 'source-block');
      block.dataset.sourceId = source.id;
      const paragraph = element('p', 'paragraph', source.text);
      const meta = element('div', 'block-meta');
      const actions = element('div', 'block-actions');
      actions.append(button('对照原文 ↗', () => compareSource(source.id)));
      const question = data.records.find(
        (record) => record.kind === 'question' && record.targets.includes(source.id),
      );
      if (question) actions.prepend(button('问答 1', () => showRecord(question.id)));
      const translation = data.records.find(
        (record) => record.kind === 'translation' && record.targets.includes(source.id),
      );
      if (translation) {
        const control = button('译文', () => toggleTranslation(source.id));
        control.dataset.translationTarget = source.id;
        control.setAttribute('aria-expanded', 'false');
        actions.prepend(control);
      }
      meta.append(element('span', 'source-page', `原文第 ${source.page} 页`), actions);
      block.append(paragraph, meta);
      if (translation) {
        const content = element('div', 'inline-translation');
        content.id = `translation-${source.id}`;
        content.hidden = true;
        const heading = element('div', 'translation-heading');
        heading.append(
          element('span', '', '中文'),
          element('span', 'translation-status', '预置译文 · 已存'),
        );
        content.append(heading, element('p', '', translation.text));
        block.append(content);
      }
      blocks.append(block);
      if (source.id === 'p48') {
        blocks.append(sourceFigure(data.equation, '公式 1 · 原 PDF 裁图'));
        blocks.append(sourceFigure(data.table, 'Table 1 · 主体与题注保留原样', true));
      }
    }
    renderTranslations();
    renderSummary();
  }

  function renderRecords() {
    for (const control of document.querySelectorAll('[data-scope]')) {
      control.setAttribute('aria-pressed', String(control.dataset.scope === ui.scope));
      control.disabled = !!ui.editing;
    }
    for (const control of document.querySelectorAll('[data-filter]')) {
      control.setAttribute('aria-pressed', String(control.dataset.filter === ui.filter));
      control.disabled = !!ui.editing;
    }
    $('mode-compare').disabled = !!ui.editing;
    $('records').replaceChildren();
    const records = store.state.records.filter(
      (record) =>
        (ui.scope === 'all' ||
          (ui.scope === 'saved'
            ? record.bookmarked
            : record.kind === 'summary' || record.targets.includes(ui.target))) &&
        (ui.filter === 'all' || record.kind === ui.filter),
    );
    for (const record of records) {
      const card = element('article', 'record-card');
      card.tabIndex = -1;
      card.dataset.recordId = record.id;
      card.classList.toggle('current-record', ui.focusedRecord === record.id);
      const meta = element('div', 'record-meta');
      meta.append(
        element('span', 'record-kind', kindLabels[record.kind]),
        element('span', '', record.edited ? '已编辑 · 本机' : '预置示例 · 本机'),
      );
      card.append(meta, element('h3', '', record.title));
      if (ui.editing === record.id) {
        const input = element('textarea');
        input.value = record.text;
        input.maxLength = 12_000;
        input.setAttribute('aria-label', '编辑已存解读');
        const editorActions = element('div', 'editor-actions');
        editorActions.append(
          button(
            '保存修改',
            () => {
              if (!input.value.trim()) {
                announce('解读内容不能为空');
                return;
              }
              if (!store.update(record.id, { text: input.value })) {
                savedStatus();
                announce('保存失败，请先复制修改的内容');
                return;
              }
              ui.editing = null;
              savedStatus();
              renderSummary();
              renderTranslations();
              renderRecords();
              announce('修改已存本机，重新打开后可继续查看');
            },
            '',
          ),
          button('取消', cancelEdit, ''),
        );
        card.append(input, editorActions);
        queueMicrotask(() => input.focus());
      } else {
        const compactSummary = record.kind === 'summary' && ui.focusedRecord !== record.id;
        card.append(
          element(
            'div',
            'record-body',
            compactSummary ? '3 条要点，已显示在章节开头。' : record.text,
          ),
        );
        const source = element(
          'div',
          'record-source',
          record.targets.map((id) => `${labels[id]} · p.${sources.get(id).page}`).join(' / '),
        );
        const actions = element('div', 'record-actions');
        actions.append(
          compactSummary
            ? button('展开解读', () => showRecord(record.id))
            : button('查看依据 ↗', () => compareSource(record.targets[0])),
        );
        const bookmark = button(record.bookmarked ? '已收藏' : '收藏', () => {
          if (ui.editing) return;
          if (store.update(record.id, { bookmarked: !record.bookmarked })) {
            savedStatus();
            renderRecords();
          } else {
            savedStatus();
            announce('收藏未能保存');
          }
        });
        bookmark.setAttribute('aria-pressed', String(record.bookmarked));
        actions.append(
          bookmark,
          button('编辑', () => {
            if (ui.editing) {
              announce('请先保存或取消正在编辑的解读');
              return;
            }
            ui.editing = record.id;
            renderRecords();
          }),
        );
        card.append(source, actions);
      }
      $('records').append(card);
    }
    if (!records.length)
      $('records').append(
        element(
          'div',
          'empty-state',
          ui.scope === 'saved'
            ? '还没有收藏。可将有用的解读收藏，之后集中查看。'
            : '此处没有对应记录，可切换到“本节全部”。',
        ),
      );
  }

  function cancelEdit() {
    ui.editing = null;
    renderRecords();
  }

  function setMode(mode) {
    if (mode === 'compare' && ui.editing) {
      announce('请先保存或取消正在编辑的解读');
      return;
    }
    ui.mode = mode;
    $('workspace').classList.toggle('compare', mode === 'compare');
    $('pdf-panel').hidden = mode !== 'compare';
    $('assistant-panel').hidden = mode === 'compare';
    $('mode-read').setAttribute('aria-pressed', String(mode === 'read'));
    $('mode-compare').setAttribute('aria-pressed', String(mode === 'compare'));
    if (mode === 'compare') void renderPDF();
  }

  /** Project unrotated PDF coordinates onto the unchanged page image; retire late image completions and transient outlines. */
  async function renderPDF() {
    const revision = ++pdfRevision;
    clearTimeout(pdfFocusTimer);
    const page = data.pages.find((item) => item.page === ui.page);
    const image = $('pdf-image');
    if (image.getAttribute('src') !== page.image) image.src = page.image;
    image.alt = `DeepSeek-OCR 原版 PDF 第 ${page.page} 页`;
    $('pdf-sheet').style.width = `${ui.zoom * 100}%`;
    $('pdf-caption').textContent = `原 PDF 页面渲染 · 第 ${page.page} 页`;
    $('full-pdf').href = `${data.paper.pdfURL}#page=${page.page}`;
    for (const control of document.querySelectorAll('[data-page]'))
      control.setAttribute('aria-pressed', String(Number(control.dataset.page) === ui.page));
    $('pdf-locations').replaceChildren();
    const source = sources.get(ui.target);
    const rects = source.page === page.page ? source.rects : [];
    for (const rect of rects) {
      const mark = element('div', 'pdf-location');
      mark.style.left = `${(rect[0] / page.width) * 100}%`;
      mark.style.top = `${((page.height - rect[3]) / page.height) * 100}%`;
      mark.style.width = `${((rect[2] - rect[0]) / page.width) * 100}%`;
      mark.style.height = `${((rect[3] - rect[1]) / page.height) * 100}%`;
      $('pdf-locations').append(mark);
    }
    try {
      await image.decode();
    } catch {
      announce('原文页面未能加载');
      return;
    }
    if (revision !== pdfRevision || ui.mode !== 'compare') return;
    const mark = $('pdf-locations').firstElementChild;
    const viewport = $('pdf-scroll');
    if (mark) {
      viewport.scrollTo({
        top: Math.max(0, mark.offsetTop + mark.offsetHeight / 2 - viewport.clientHeight / 2 + 21),
        left: Math.max(0, mark.offsetLeft + mark.offsetWidth / 2 - viewport.clientWidth / 2 + 21),
        behavior: 'smooth',
      });
    } else viewport.scrollTo({ top: 0, left: 0 });
    pdfFocusTimer = setTimeout(() => {
      if (revision === pdfRevision) $('pdf-locations').replaceChildren();
    }, 6000);
  }

  function compareSource(id) {
    if (ui.editing) {
      announce('请先保存或取消正在编辑的解读');
      return;
    }
    updateCurrent(id);
    ui.page = sources.get(id).page;
    setMode('compare');
    goToReading(id, false);
    if (matchMedia('(max-width: 700px)').matches)
      $('pdf-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function toggleTranslations() {
    saveView({ translations: !store.state.view.translations });
    $('toggle-translation').setAttribute('aria-pressed', String(store.state.view.translations));
    renderTranslations();
  }

  $('paper-link').href = data.paper.sourceURL;
  $('full-pdf').href = `${data.paper.pdfURL}#page=6`;
  $('mode-read').onclick = () => setMode('read');
  $('mode-compare').onclick = () => compareSource(ui.target);
  $('close-compare').onclick = () => {
    setMode('read');
    $('mode-compare').focus();
  };
  $('toggle-translation').onclick = toggleTranslations;
  $('toggle-insights').onclick = () => {
    saveView({ insights: !store.state.view.insights });
    $('toggle-insights').setAttribute('aria-pressed', String(store.state.view.insights));
    renderSummary();
  };
  $('summary-inline').addEventListener('toggle', () => {
    if ($('summary-inline').open !== store.state.view.summaryOpen)
      saveView({ summaryOpen: $('summary-inline').open });
  });
  for (const node of document.querySelectorAll('[data-target]'))
    node.onclick = () => goToReading(node.dataset.target);
  for (const node of document.querySelectorAll('[data-record]'))
    node.onclick = () => showRecord(node.dataset.record);
  for (const node of document.querySelectorAll('[data-scope]'))
    node.onclick = () => {
      ui.scope = node.dataset.scope;
      renderRecords();
    };
  for (const node of document.querySelectorAll('[data-filter]'))
    node.onclick = () => {
      ui.filter = node.dataset.filter;
      renderRecords();
    };
  for (const node of document.querySelectorAll('[data-page]'))
    node.onclick = () => {
      ui.page = Number(node.dataset.page);
      void renderPDF();
    };
  $('pdf-zoom').onchange = () => {
    ui.zoom = Number($('pdf-zoom').value);
    void renderPDF();
  };
  $('about').onclick = () => $('about-dialog').showModal();
  $('close-about').onclick = () => $('about-dialog').close();
  $('reset-demo').onclick = () => {
    if (!confirm('恢复预置示例会清除本原型中的编辑和收藏，是否继续？')) return;
    if (store.reset()) location.reload();
    else {
      savedStatus();
      announce('当前浏览器无法保存记录');
    }
  };
  $('reader-scroll').addEventListener(
    'scroll',
    () => {
      if (scrollFrame !== null) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = null;
        if (performance.now() < navigationUntil) return;
        const viewport = $('reader-scroll').getBoundingClientRect();
        const position = viewport.top + Math.min(160, viewport.height * 0.25);
        const closest = [...document.querySelectorAll('.source-block')]
          .filter((node) => node.getBoundingClientRect().bottom > viewport.top + 20)
          .sort(
            (a, b) =>
              Math.abs(a.getBoundingClientRect().top - position) -
              Math.abs(b.getBoundingClientRect().top - position),
          )[0];
        if (closest && closest.dataset.sourceId !== ui.target)
          updateCurrent(closest.dataset.sourceId);
      });
    },
    { passive: true },
  );
  window.addEventListener('keydown', (event) => {
    if (
      event.isComposing ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      $('about-dialog').open
    )
      return;
    if (event.key === 'Escape') {
      if (ui.editing) {
        event.preventDefault();
        cancelEdit();
      } else if (ui.mode === 'compare') {
        event.preventDefault();
        setMode('read');
      }
      return;
    }
    if (event.target.closest?.('input,textarea,select,[contenteditable="true"]')) return;
    if (event.key === 'c') {
      event.preventDefault();
      ui.mode === 'read' ? compareSource(ui.target) : setMode('read');
    }
    if (event.key === 't') {
      event.preventDefault();
      toggleTranslations();
    }
    if (event.key === 'j' || event.key === 'k') {
      event.preventDefault();
      $('reader-scroll').scrollBy({ top: event.key === 'j' ? 125 : -125, behavior: 'smooth' });
    }
  });
  window.addEventListener('pagehide', () => {
    if (!store.error) store.setView({ target: ui.target });
  });

  renderDocument();
  renderRecords();
  updateCurrent(ui.target, false);
  $('toggle-translation').setAttribute('aria-pressed', String(store.state.view.translations));
  $('toggle-insights').setAttribute('aria-pressed', String(store.state.view.insights));
  savedStatus();
  if (ui.target !== 'p46') requestAnimationFrame(() => goToReading(ui.target, false));
}

start().catch(() => {
  $('save-state').textContent = '加载未完成';
  $('fatal-error').hidden = false;
});
