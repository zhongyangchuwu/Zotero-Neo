import { React, createRoot } from '../../../vendor/react/index.js';

const { useEffect, useRef, useState } = React;
type Surface = 'settings' | 'picker' | 'references';
type Section = '外观' | '交互' | '阅读器' | '快捷键' | '模块' | '高级';
type Settings = {
  density: string;
  theme: string;
  accent: string;
  font: string;
  singleClick: boolean;
  confirmClose: boolean;
  metadata: boolean;
  cache: boolean;
  shortcut: string;
  module: boolean;
};
const defaults: Settings = {
  density: '紧凑',
  theme: '跟随系统',
  accent: '蓝色',
  font: '系统默认',
  singleClick: false,
  confirmClose: true,
  metadata: true,
  cache: true,
  shortcut: 'Ctrl+Shift+P',
  module: false,
};
const sections: Section[] = ['外观', '交互', '阅读器', '快捷键', '模块', '高级'];
const sectionHints: Record<Section, string> = {
  外观: 'appearance density theme accent font 密度 主题 强调色 字体 预览',
  交互: 'interaction click confirm 单击 确认 关闭',
  阅读器: 'reader metadata cache 元数据 缓存',
  快捷键: 'keybindings shortcut search 键盘 快捷键 搜索',
  模块: 'modules restart 模块 重启',
  高级: 'advanced reset 重置',
};
const papers = [
  {
    title: 'Attention Is All You Need',
    authors: 'Ashish Vaswani et al.',
    year: '2017',
    type: '预印本',
    id: '1706.03762',
  },
  {
    title: 'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding',
    authors: 'Jacob Devlin et al.',
    year: '2018',
    type: '预印本',
    id: '1810.04805',
  },
  {
    title: 'Deep Residual Learning for Image Recognition',
    authors: 'Kaiming He et al.',
    year: '2015',
    type: '会议论文',
    id: '1512.03385',
  },
  {
    title: 'The Elements of Statistical Learning',
    authors: 'Trevor Hastie, Robert Tibshirani, Jerome Friedman',
    year: '2009',
    type: '图书',
    id: '978-0-387-84857-0',
  },
];
function Row({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="row">
      <div>
        <div className="row-title">{title}</div>
        <div className="muted small">{description}</div>
      </div>
      <div className="row-control">{children}</div>
    </div>
  );
}
function SettingsView() {
  const [saved, setSaved] = useState<Settings>({ ...defaults });
  const [draft, setDraft] = useState<Settings>({ ...defaults });
  const [section, setSection] = useState<Section>('外观');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('更改仅保存在本次样例会话中。');
  const [confirmReset, setConfirmReset] = useState(false);
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft);
  function change<K extends keyof Settings>(key: K, value: Settings[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage('有未保存的样例更改。');
  }
  const filtered = query.trim()
    ? sections.filter((item) =>
        `${item} ${sectionHints[item]}`.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : [section];
  return (
    <div className="settings-layout">
      <aside className="settings-nav">
        <div className="eyebrow">WORKSPACE</div>
        <h2>设置中心</h2>
        <p className="muted small">设计样例 · 本次会话</p>
        <nav aria-label="设置分类">
          {sections.map((item, index) => (
            <button
              key={item}
              className={`nav-item ${section === item && !query ? 'active' : ''}`}
              onClick={() => {
                setSection(item);
                setQuery('');
              }}
            >
              <span className="nav-icon">{['◈', '◉', '▤', '⌘', '◇', '⚙'][index]}</span>
              {item}
            </button>
          ))}
        </nav>
        <div className="nav-bottom">
          示例配置
          <br />
          <span className="muted">不会修改 Zotero 偏好设置</span>
        </div>
      </aside>
      <main className="settings-main">
        <div className="page-head">
          <div>
            <div className="breadcrumb">
              工作区 <span>/</span> 设置
            </div>
            <h1>设置中心</h1>
            <p className="muted">让工作空间适合你的阅读方式。</p>
          </div>
          <div className="actions">
            <button
              disabled={!dirty}
              onClick={() => {
                setDraft({ ...saved });
                setMessage('已取消未保存的样例更改。');
              }}
            >
              取消
            </button>
            <button
              className="primary"
              disabled={!dirty}
              onClick={() => {
                setSaved({ ...draft });
                setMessage('样例设置已保存到本次会话，未修改 Zotero。');
              }}
            >
              保存更改
            </button>
          </div>
        </div>
        <div className="search-wrap">
          <span aria-hidden="true">⌕</span>
          <input
            aria-label="搜索设置"
            placeholder="搜索设置或快捷键…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="status" role="status">
          <span className={`status-dot ${dirty ? 'pending' : ''}`} />
          {message}
        </div>
        {filtered.length === 0 && <div className="empty">没有找到匹配的设置。试试其他关键词。</div>}
        {filtered.map((item) => (
          <section className="settings-section" key={item}>
            <div className="section-heading">
              <div>
                <div className="eyebrow">{item === '外观' ? 'PERSONALIZATION' : 'PREFERENCES'}</div>
                <h2>{item}</h2>
              </div>
              <span className="muted small">样例选项</span>
            </div>
            {item === '外观' && (
              <div className="card">
                <Row title="界面密度" description="调整列表和控件的间距。">
                  <select
                    aria-label="界面密度"
                    value={draft.density}
                    onChange={(e) => change('density', e.target.value)}
                  >
                    <option>紧凑</option>
                    <option>舒适</option>
                  </select>
                </Row>
                <Row title="主题" description="为样例选择首选外观。">
                  <select
                    aria-label="主题"
                    value={draft.theme}
                    onChange={(e) => change('theme', e.target.value)}
                  >
                    <option>跟随系统</option>
                    <option>浅色</option>
                    <option>深色</option>
                  </select>
                </Row>
                <Row title="强调色" description="用于选中状态和主要操作。">
                  <select
                    aria-label="强调色"
                    value={draft.accent}
                    onChange={(e) => change('accent', e.target.value)}
                  >
                    <option>蓝色</option>
                    <option>石墨色</option>
                  </select>
                </Row>
                <Row title="界面字体" description="中文优先使用系统字体。">
                  <select
                    aria-label="界面字体"
                    value={draft.font}
                    onChange={(e) => change('font', e.target.value)}
                  >
                    <option>系统默认</option>
                    <option>衬线</option>
                  </select>
                </Row>
                <div
                  className="preview-sample"
                  data-preview-theme={
                    draft.theme === '浅色' ? 'light' : draft.theme === '深色' ? 'dark' : undefined
                  }
                  style={{
                    fontFamily: draft.font === '衬线' ? 'serif' : undefined,
                    padding: draft.density === '舒适' ? '20px' : '12px',
                    color: draft.accent === '石墨色' ? 'var(--text)' : 'var(--accent)',
                  }}
                >
                  <strong>预览</strong>　阅读、整理，保持专注。
                  <span className="muted">
                    　{draft.theme} · {draft.density}
                  </span>
                </div>
              </div>
            )}
            {item === '交互' && (
              <div className="card">
                <Row title="单击选择条目" description="启用后，单击即选中；不表示打开文件。">
                  <input
                    aria-label="单击选择条目"
                    type="checkbox"
                    checked={draft.singleClick}
                    onChange={(e) => change('singleClick', e.target.checked)}
                  />
                </Row>
                <Row
                  title="关闭前确认未保存更改"
                  description="在样例中记录偏好，不影响 Zotero 窗口。"
                >
                  <input
                    aria-label="关闭前确认未保存更改"
                    type="checkbox"
                    checked={draft.confirmClose}
                    onChange={(e) => change('confirmClose', e.target.checked)}
                  />
                </Row>
              </div>
            )}
            {item === '阅读器' && (
              <div className="card">
                <Row title="显示参考文献元数据" description="在阅读时展示样例来源与标识符。">
                  <input
                    aria-label="显示参考文献元数据"
                    type="checkbox"
                    checked={draft.metadata}
                    onChange={(e) => change('metadata', e.target.checked)}
                  />
                </Row>
                <Row title="保留示例缓存" description="仅记录样例偏好；不会访问或清除真实缓存。">
                  <input
                    aria-label="保留示例缓存"
                    type="checkbox"
                    checked={draft.cache}
                    onChange={(e) => change('cache', e.target.checked)}
                  />
                </Row>
              </div>
            )}
            {item === '快捷键' && (
              <div className="card">
                <Row title="搜索文献" description="编辑示例快捷键文本；不会注册系统快捷键。">
                  <input
                    aria-label="搜索文献快捷键"
                    className="shortcut-input"
                    value={draft.shortcut}
                    onChange={(e) => change('shortcut', e.target.value)}
                  />
                </Row>
              </div>
            )}
            {item === '模块' && (
              <div className="card">
                <Row title="参考资料扩展" description="可选模块的示例请求，不会更改实际模块。">
                  <input
                    aria-label="请求参考资料扩展"
                    type="checkbox"
                    checked={draft.module}
                    onChange={(e) => change('module', e.target.checked)}
                  />
                </Row>
                <div className="card-note">
                  草稿（示例）：{draft.module ? '开启' : '关闭'} · 已保存请求：
                  {saved.module ? '开启' : '关闭'} · 本次已应用：关闭
                  {saved.module ? ' · 待重启（仅示例）' : ''}
                </div>
              </div>
            )}
            {item === '高级' && (
              <div className="card">
                <Row title="重置样例设置" description="恢复本次会话的默认值；不影响真实配置。">
                  <button onClick={() => setConfirmReset(true)}>重置样例…</button>
                </Row>
                {confirmReset && (
                  <div className="confirm-box" role="alert">
                    <strong>重置样例设置？</strong>
                    <p>已保存和未保存的样例值都会恢复为默认值。</p>
                    <div className="actions">
                      <button onClick={() => setConfirmReset(false)}>保留</button>
                      <button
                        className="primary"
                        onClick={() => {
                          setSaved({ ...defaults });
                          setDraft({ ...defaults });
                          setConfirmReset(false);
                          setMessage('样例设置已重置；真实配置未更改。');
                        }}
                      >
                        确认重置
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        ))}
      </main>
    </div>
  );
}
function PickerView() {
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const reopen = useRef<HTMLButtonElement>(null);
  const composing = useRef(false);
  const results = papers.filter((paper) =>
    `${paper.title} ${paper.authors} ${paper.year} ${paper.type} ${paper.id}`
      .toLowerCase()
      .includes(query.toLowerCase().trim()),
  );
  const selected = results[Math.min(index, results.length - 1)];
  useEffect(() => {
    if (open) input.current?.focus();
    else reopen.current?.focus();
  }, [open]);
  function close() {
    setOpen(false);
  }
  function choose() {
    if (selected) {
      setChosen(selected.title);
      close();
    }
  }
  return (
    <main className="picker-page">
      <div className="surface-intro">
        <div>
          <div className="eyebrow">QUICK FIND</div>
          <h1>快速查找</h1>
          <p className="muted">从公开文献样例中查找并选择。不会打开 PDF 或修改文库。</p>
        </div>
        <button ref={reopen} onClick={() => setOpen(true)}>
          打开选择器
        </button>
      </div>
      {chosen && (
        <div className="status" role="status">
          已选择样例：{chosen}。没有修改文库。
        </div>
      )}
      {open && (
        <div
          className="picker"
          role="dialog"
          aria-modal="false"
          aria-labelledby="picker-title"
          onKeyDown={(event) => {
            if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
            if (event.key === 'Escape') {
              event.preventDefault();
              close();
            } else if (event.key === 'ArrowDown') {
              event.preventDefault();
              setIndex((current) =>
                Math.min(current + 1, results.length - 1 < 0 ? 0 : results.length - 1),
              );
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setIndex((current) => Math.max(current - 1, 0));
            } else if (event.key === 'Enter' && event.target === input.current) {
              event.preventDefault();
              choose();
            }
          }}
        >
          <div className="picker-search">
            <span aria-hidden="true">⌕</span>
            <input
              ref={input}
              id="picker-title"
              role="combobox"
              aria-expanded="true"
              aria-controls="picker-results"
              aria-activedescendant={selected ? `paper-${selected.id}` : undefined}
              aria-label="搜索公开文献样例"
              placeholder="搜索标题、作者或年份…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setIndex(0);
              }}
              onCompositionStart={() => {
                composing.current = true;
              }}
              onCompositionEnd={() => {
                composing.current = false;
              }}
            />
            <button className="ghost" onClick={close} aria-label="关闭选择器">
              <kbd>ESC</kbd>
            </button>
          </div>
          <div className="picker-body">
            <div className="result-column">
              <div className="list-label">
                文献样例 <span>{results.length} 项</span>
              </div>
              <div id="picker-results" role="listbox" aria-label="搜索结果">
                {results.map((paper, i) => (
                  <div
                    id={`paper-${paper.id}`}
                    key={paper.id}
                    role="option"
                    aria-selected={i === Math.min(index, results.length - 1)}
                    className={`result ${i === Math.min(index, results.length - 1) ? 'selected' : ''}`}
                    onClick={() => {
                      setIndex(i);
                      input.current?.focus();
                    }}
                  >
                    <div className="paper-icon">▤</div>
                    <div>
                      <strong>{paper.title}</strong>
                      <div className="muted small">
                        {paper.authors} · {paper.year}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {!results.length && <div className="empty">没有匹配的文献样例。</div>}
            </div>
            <div className="detail-column">
              {selected ? (
                <>
                  <div className="eyebrow">PREVIEW</div>
                  <div className="detail-icon">▤</div>
                  <h2>{selected.title}</h2>
                  <p className="muted">{selected.authors}</p>
                  <div className="detail-meta">
                    <span>类型</span>
                    <strong>{selected.type}</strong>
                    <span>年份</span>
                    <strong>{selected.year}</strong>
                    <span>标识符</span>
                    <code>{selected.id}</code>
                  </div>
                  <button className="primary full" onClick={choose}>
                    选择此样例
                  </button>
                  <p className="muted small">仅在此工作台中选择，不会打开文件。</p>
                </>
              ) : (
                <p className="muted">选择结果以查看预览。</p>
              )}
            </div>
          </div>
          <div className="picker-footer">
            <span>
              <kbd>↑</kbd> <kbd>↓</kbd> 移动　 <kbd>↵</kbd> 选择　 <kbd>esc</kbd> 关闭
            </span>
            <span>公开文献样例</span>
          </div>
        </div>
      )}
    </main>
  );
}
function ReferencesView({ initial }: { initial: string | null }) {
  const [cache, setCache] = useState(initial !== 'empty');
  const [error, setError] = useState(initial === 'error');
  function scenario(value: string) {
    setCache(value !== 'empty');
    setError(value === 'error');
  }
  return (
    <main className="references-page">
      <div className="surface-intro">
        <div>
          <div className="eyebrow">REFERENCE DETAILS</div>
          <h1>参考文献详情</h1>
          <p className="muted">查看原始元数据、来源与缓存状态。</p>
        </div>
        <span className="badge">公开数据样例</span>
      </div>
      <div className="scenario">
        <div>
          <strong>演示场景</strong>
          <div className="muted small">切换本地样例状态，不发送网络请求。</div>
        </div>
        <label>
          状态{' '}
          <select
            aria-label="演示场景"
            value={!cache ? 'empty' : error ? 'error' : 'cached'}
            onChange={(e) => scenario(e.target.value)}
          >
            <option value="cached">已有缓存</option>
            <option value="error">离线刷新错误</option>
            <option value="empty">空缓存</option>
          </select>
        </label>
      </div>
      <div className="references-grid">
        <section className="reference-main">
          <div className="card reference-card">
            <div className="reference-top">
              <span className="badge">arXiv · 预印本</span>
              <span className="muted small">原始公开数据摘录 · 样例</span>
            </div>
            <h2>Attention Is All You Need</h2>
            <p className="muted">
              Ashish Vaswani, Noam Shazeer, Niki Parmar, Jakob Uszkoreit, Llion Jones, Aidan N.
              Gomez, Łukasz Kaiser, Illia Polosukhin
            </p>
            <div className="reference-facts">
              <div>
                <span>发表年份</span>
                <strong>2017</strong>
              </div>
              <div>
                <span>标识符</span>
                <code>arXiv:1706.03762v7</code>
              </div>
              <div>
                <span>来源</span>
                <a href="https://arxiv.org/abs/1706.03762v7" target="_blank" rel="noreferrer">
                  arXiv ↗
                </a>
              </div>
            </div>
          </div>
          <div className="card reference-card">
            <div className="section-heading">
              <div>
                <div className="eyebrow">RAW ABSTRACT</div>
                <h2>原始摘要</h2>
              </div>
              <span className="badge">未翻译</span>
            </div>
            {cache ? (
              <p className="abstract">
                The dominant sequence transduction models are based on complex recurrent or
                convolutional neural networks in an encoder-decoder configuration. The best
                performing models also connect the encoder and decoder through an attention
                mechanism. We propose a new simple network architecture, the Transformer, based
                solely on attention mechanisms, dispensing with recurrence and convolutions
                entirely.
              </p>
            ) : (
              <div className="empty">样例缓存为空，没有可显示的摘要。选择演示场景可恢复样例。</div>
            )}
            <p className="muted small">摘录自 arXiv 公开摘要；为便于展示，仅显示开头。</p>
          </div>
        </section>
        <aside className="reference-side">
          <div className="card reference-card">
            <div className="eyebrow">PROVENANCE</div>
            <h2>来源与缓存</h2>
            <div className="metadata">
              <span>状态</span>
              <strong>{cache ? '样例缓存 · 可能过期' : '无样例缓存'}</strong>
              <span>来源</span>
              <strong>{cache ? 'arXiv 公开摘要' : '—'}</strong>
              <span>示例记录日期</span>
              <strong>{cache ? '2024-01-15' : '—'}</strong>
            </div>
            <p className="muted small">日期为固定样例，并非本次获取时间。</p>
            {error && (
              <div className="error" role="alert">
                离线刷新演示失败：未发送网络请求。
                {cache ? '保留原始内容、来源和示例记录日期。' : '缓存仍为空。'}
              </div>
            )}
            <div className="stack">
              <button onClick={() => setError(true)}>模拟离线刷新</button>
              <button
                disabled={!cache}
                title={!cache ? '样例缓存已为空' : undefined}
                onClick={() => {
                  setCache(false);
                  setError(false);
                }}
              >
                清除样例缓存
              </button>
            </div>
          </div>
          <div className="card reference-card">
            <h2>文库操作</h2>
            <p className="muted small">样例未连接 Zotero，不能修改真实文库。</p>
            <button disabled title="样例未连接 Zotero">
              添加到文库
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}
function App() {
  const params = new URLSearchParams(location.search);
  const requested = params.get('surface');
  const [surface, setSurface] = useState<Surface>(
    requested === 'picker' || requested === 'references' ? requested : 'settings',
  );
  const [theme, setTheme] = useState(params.get('theme') === 'dark' ? 'dark' : 'light');
  function navigate(next: Surface, nextTheme = theme) {
    setSurface(next);
    setTheme(nextTheme);
    const url = new URL(location.href);
    url.searchParams.set('surface', next);
    url.searchParams.set('theme', nextTheme);
    url.searchParams.delete('state');
    history.replaceState(null, '', url);
  }
  return (
    <div className="workbench" data-theme={theme}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">N</span>
          <div>
            <strong>Neo</strong>
            <span> / Design workbench</span>
          </div>
        </div>
        <nav aria-label="样例页面" className="surface-nav">
          <button
            className={surface === 'settings' ? 'current' : ''}
            onClick={() => navigate('settings')}
          >
            设置中心
          </button>
          <button
            className={surface === 'picker' ? 'current' : ''}
            onClick={() => navigate('picker')}
          >
            快速查找
          </button>
          <button
            className={surface === 'references' ? 'current' : ''}
            onClick={() => navigate('references')}
          >
            参考详情
          </button>
        </nav>
        <button
          className="theme-toggle"
          onClick={() => navigate(surface, theme === 'light' ? 'dark' : 'light')}
          aria-label="切换浅色或深色"
        >
          {theme === 'light' ? '☾ 深色' : '☀ 浅色'}
        </button>
      </header>
      <div className="demo-banner">
        <strong>交互设计样例 · 尚未接入 Zotero</strong>
        <span>数据与设置仅存在于样例会话，不代表实际文库或配置。</span>
      </div>
      <div hidden={surface !== 'settings'}>
        <SettingsView />
      </div>
      {surface === 'picker' && <PickerView />}
      {surface === 'references' && <ReferencesView initial={params.get('state')} />}
    </div>
  );
}
const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
