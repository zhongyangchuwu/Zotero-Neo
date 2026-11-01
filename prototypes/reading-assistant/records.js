/** Prototype storage stays separate from Zotero and contains only this public sample's reading records. */
export function openReadingRecords(document) {
  const key = `neo.reading-assistant.prototype.v1:${document.paper.fingerprint}`;
  const seeds = document.records;
  const targets = new Set([
    ...document.blocks.map((block) => block.id),
    document.table.id,
    document.equation.id,
  ]);
  const defaults = () => ({
    version: 1,
    fingerprint: document.paper.fingerprint,
    records: seeds.map((record) => ({
      ...record,
      text: record.text,
      bookmarked: false,
      edited: false,
      updatedAt: null,
    })),
    view: { target: 'p46', translations: false, insights: true, summaryOpen: true },
  });
  let state = defaults();
  let error = '';

  function decode(raw) {
    const snapshot = defaults();
    if (raw !== null) {
      if (raw.length > 1_000_000) throw new Error('Record size exceeded');
      const saved = JSON.parse(raw);
      if (
        saved.version !== 1 ||
        saved.fingerprint !== document.paper.fingerprint ||
        !Array.isArray(saved.records) ||
        saved.records.length !== seeds.length
      )
        throw new Error('Invalid document records');
      snapshot.records = seeds.map((seed) => {
        const record = saved.records.find((candidate) => candidate.id === seed.id);
        if (!record || typeof record.text !== 'string' || record.text.length > 12_000)
          throw new Error('Invalid reading record');
        return {
          ...seed,
          text: record.text,
          bookmarked: record.bookmarked === true,
          edited: record.edited === true,
          updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : null,
        };
      });
      snapshot.view = {
        target: targets.has(saved.view?.target) ? saved.view.target : 'p46',
        translations: saved.view?.translations === true,
        insights: saved.view?.insights !== false,
        summaryOpen: saved.view?.summaryOpen !== false,
      };
    }
    return snapshot;
  }

  try {
    const raw = localStorage.getItem(key);
    state = decode(raw);
    if (raw === null) localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Keep an unreadable saved value intact until the user explicitly restores the sample.
    error = '本机记录暂不可用，当前为临时查看';
  }

  function commit(change, reset = false) {
    try {
      // Closing or scrolling an older tab must not restore its stale copy of edited records.
      const latest = reset ? defaults() : decode(localStorage.getItem(key));
      const next = change(latest);
      if (!next) return false;
      localStorage.setItem(key, JSON.stringify(next));
      state = next;
      error = '';
      return true;
    } catch {
      error = '保存失败，请先复制修改的内容';
      return false;
    }
  }

  return {
    key,
    get state() {
      return state;
    },
    get error() {
      return error;
    },
    update(id, patch) {
      return commit((latest) => {
        const record = latest.records.find((item) => item.id === id);
        if (!record) return null;
        const text = patch.text ?? record.text;
        if (typeof text !== 'string' || text.length > 12_000 || !text.trim()) return null;
        const next = {
          ...record,
          text,
          edited: patch.text === undefined ? record.edited : true,
          bookmarked: patch.bookmarked ?? record.bookmarked,
          updatedAt: new Date().toISOString(),
        };
        return { ...latest, records: latest.records.map((item) => (item.id === id ? next : item)) };
      });
    },
    setView(patch) {
      if (error) return false;
      return commit((latest) => ({ ...latest, view: { ...latest.view, ...patch } }));
    },
    reset() {
      return commit((next) => next, true);
    },
  };
}
