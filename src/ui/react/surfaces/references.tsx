import { React } from '../runtime';
import { createReactView } from '../view';
import type { ReactView } from '../types';
import type {
  ReferenceCommand,
  ReferenceControlsCommand,
  ReferenceControlsModel,
  ReferenceViewModel,
} from '../../../references/react-model';

export const REFERENCES_REACT_CSS = `
.neo-reference button { box-sizing: border-box; white-space: normal; margin: 4px 6px 0 0; padding: 4px 6px; border: 1px solid var(--zotero-neo-border); border-radius: 4px; text-align: left; cursor: pointer; }
.neo-reference .neo-reference-row { display: block; width: 100%; }
.neo-reference input { box-sizing: border-box; max-width: 100%; }
.neo-reference-controls { display:flex; gap:6px; flex-wrap:wrap; margin-top:6px; }
.neo-reference-controls button { padding:2px 6px; border:1px solid var(--zotero-neo-border); border-radius:4px; cursor:pointer; }
`;

export function mountReferenceReactView(
  root: HTMLElement,
  initialModel: ReferenceViewModel,
  dispatch: (command: ReferenceCommand) => void,
): ReactView<ReferenceViewModel> {
  const render = (model: ReferenceViewModel) => {
    const t = (en: string, zh: string) => (model.chinese ? zh : en);
    const button = (label: string, type: ReferenceCommand['type']) => (
      <button
        type="button"
        onClick={() => dispatch({ type, generation: model.generation } as ReferenceCommand)}
      >
        {label}
      </button>
    );
    const input = (label: string) => (
      <input
        key={model.scene}
        data-neo-ui-part="query"
        type="search"
        aria-label={label}
        placeholder={model.scene === 'catalog' ? label : undefined}
        defaultValue={model.query}
        onChange={(event) => {
          if (model.scene !== 'catalog' || !(event.nativeEvent as InputEvent).isComposing)
            dispatch({
              type: 'query',
              value: event.currentTarget.value,
              generation: model.generation,
            });
        }}
        onCompositionEnd={(event) => {
          if (model.scene === 'catalog')
            dispatch({
              type: 'query',
              value: event.currentTarget.value,
              generation: model.generation,
            });
        }}
        onKeyDown={(event) => {
          if (
            event.key === 'Enter' &&
            !event.nativeEvent.isComposing &&
            model.scene !== 'catalog'
          ) {
            event.preventDefault();
            dispatch({
              type: model.scene === 'local' ? 'local-search' : 'metadata-search',
              generation: model.generation,
            });
          }
        }}
      />
    );
    const rowType =
      model.scene === 'mentions'
        ? 'occurrence'
        : model.scene === 'local'
          ? 'match'
          : model.scene === 'metadata'
            ? 'candidate'
            : 'select';
    return (
      <div className="neo-ui neo-reference">
        {button(t('Close', '关闭'), 'close')}
        <p role="status">{model.status}</p>
        <div data-neo-ui-part="body">
          {model.title && <h3>{model.title}</h3>}
          {model.description && <p>{model.description}</p>}
          {model.scene === 'catalog' && input(t('Filter bibliography', '筛选参考文献'))}
          {(model.scene === 'local' || model.scene === 'metadata') &&
            input(
              model.scene === 'local'
                ? t('Local title, DOI or arXiv ID', '本地标题、DOI 或 arXiv ID')
                : t('Reference search query', '参考文献搜索词'),
            )}
          {model.scene === 'metadata' && <p>{model.provenance}</p>}
          <div data-neo-ui-part="result" tabIndex={-1}>
            {model.result && <p>{model.result}</p>}
            {model.rows.map((row) => (
              <button
                className="neo-reference-row"
                type="button"
                key={row.id}
                onClick={() =>
                  dispatch({ type: rowType, id: row.id, generation: model.generation })
                }
              >
                {row.label}
              </button>
            ))}
            {model.paper && model.scene === 'metadata' && (
              <>
                <p>
                  {model.paper.title} — {model.paper.authors.join(', ')}
                  {model.paper.year ? ` (${model.paper.year})` : ''}
                </p>
                <p>
                  {model.paper.source} · {model.paper.retrievedAt}
                </p>
                <p>
                  {t('Publication', '出版信息')}: {model.paper.venue ?? '—'}
                </p>
                <p>
                  DOI: {model.paper.doi ?? '—'} · arXiv: {model.paper.arxivID ?? '—'}
                </p>
                <p>
                  {t('API references', 'API 参考文献数')}: {model.paper.referenceCount ?? '—'} ·{' '}
                  {t('API citations', 'API 引用数')}: {model.paper.citationCount ?? '—'}
                </p>
                <h4>{t('Original abstract', '原始摘要')}</h4>
                <p>
                  {model.paper.abstract || t('No abstract provided by source.', '来源未提供摘要。')}
                </p>
                {model.paper.url && button(t('Open source', '打开来源'), 'source')}
                {model.paper.pdfURL && button(t('Open source PDF', '打开来源 PDF'), 'pdf')}
                {button(t('Add to Zotero', '添加到 Zotero'), 'add')}
              </>
            )}
          </div>
          {model.scene === 'target' && (
            <>
              {model.hasTarget && (
                <>
                  {button(t('Jump to bibliography', '跳转到参考文献'), 'jump')}
                  {button(t('Recognized local mentions', '已识别的本地引用位置'), 'mentions')}
                  {button(t('Find local matches', '查找本地匹配'), 'local')}
                  {button(t('Paper details', '论文详情'), 'metadata')}
                  {model.doi && button(t('Open DOI', '打开 DOI'), 'doi')}
                  {model.arxiv && button(t('Open arXiv', '打开 arXiv'), 'arxiv')}
                  {button(t('Search web', '网页搜索'), 'web')}
                </>
              )}
              {button(t('Search bibliography', '搜索参考文献'), 'catalog')}
            </>
          )}
          {model.scene === 'choose' && button(t('Search bibliography', '搜索参考文献'), 'catalog')}
          {model.scene === 'local' && button(t('Find in library', '在文库中查找'), 'local-search')}
          {model.scene === 'metadata' && (
            <>
              {button(t('Search metadata', '搜索元数据'), 'metadata-search')}
              {button(t('Refresh metadata', '刷新元数据'), 'metadata-refresh')}
              {button(t('Clear metadata cache', '清除元数据缓存'), 'metadata-clear')}
            </>
          )}
          {(model.scene === 'mentions' || model.scene === 'local' || model.scene === 'metadata') &&
            button(t('Back', '返回'), 'back')}
        </div>
      </div>
    );
  };
  return createReactView(root, render, initialModel);
}

export function mountReferenceControlsReactView(
  root: HTMLElement,
  initialModel: ReferenceControlsModel,
  dispatch: (command: ReferenceControlsCommand) => void,
): ReactView<ReferenceControlsModel> {
  return createReactView(
    root,
    (model) => (
      <>
        {(
          [
            ['mentions', 'In-text mentions', '文中引用'],
            ['local', 'Local copies', '本地副本'],
            ['metadata', 'Paper details', '论文详情'],
          ] as const
        ).map(([type, en, zh]) => (
          <button
            key={type}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              dispatch({ type });
            }}
          >
            {model.chinese ? zh : en}
          </button>
        ))}
      </>
    ),
    initialModel,
  );
}
