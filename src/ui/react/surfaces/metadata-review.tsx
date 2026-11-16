import { React } from '../runtime';
import { createReactView } from '../view';
import { Button, Status } from '../components';
import type { ReactView } from '../types';
import type {
  MetadataReviewCommand,
  MetadataReviewModel,
} from '../../../metadata-review/react-model';

export const METADATA_REVIEW_CSS = `
.neo-metadata-toolbar { display:flex;align-items:center;gap:8px;flex-wrap:wrap; }
.neo-metadata-fields { width:100%;border-collapse:collapse; }
.neo-metadata-fields th,.neo-metadata-fields td { padding:8px;border-bottom:1px solid var(--zotero-neo-border);text-align:start;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere; }
.neo-metadata-fields td { max-width:340px; }
.neo-metadata-review select,.neo-metadata-review textarea { color:inherit;background:var(--zotero-neo-surface);border:1px solid var(--zotero-neo-border);padding:6px;max-width:100%;font:inherit; }
.neo-metadata-review textarea { width:100%;min-height:90px;box-sizing:border-box; }
`;
export function mountMetadataReviewView(
  root: HTMLElement,
  initial: MetadataReviewModel,
  dispatch: (command: MetadataReviewCommand) => void,
): ReactView<MetadataReviewModel> {
  return createReactView(
    root,
    (model) => {
      const text = (cn: string, en: string) => (model.chinese ? cn : en);
      return (
        <div className="neo-metadata-review">
          <h2>{text('论文信息检查与更新', 'Inspect and update paper metadata')}</h2>
          <p className="neo-muted">
            {text(
              '只查询当前明确选择的范围。选择来源并开始检查；打开面板不联网、不改条目。',
              'Only the captured items are inspected. Choose a source and start; opening this panel does not query the network or change items.',
            )}
          </p>
          <div className="neo-metadata-toolbar">
            <label>
              {text('条目', 'Item')}{' '}
              <select
                value={model.itemIndex}
                disabled={model.busy}
                onChange={(event) =>
                  dispatch({ type: 'item', index: Number(event.currentTarget.value) })
                }
              >
                {model.items.map((item, index) => (
                  <option key={index} value={index}>
                    {index + 1}. {item.title} {item.status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {text('来源', 'Source')}{' '}
              <select
                data-neo-ui-part="source"
                value={model.source}
                disabled={model.busy}
                onChange={(event) => dispatch({ type: 'source', value: event.currentTarget.value })}
              >
                {model.sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.label}
                  </option>
                ))}
              </select>
            </label>
            <Button
              disabled={model.busy || !model.items.length}
              onClick={() => dispatch({ type: 'inspect' })}
            >
              {text('检查当前条目', 'Inspect item')}
            </Button>
            <Button
              disabled={model.busy || !model.items.length}
              onClick={() => dispatch({ type: 'inspect-all' })}
            >
              {text('检查全部目标', 'Inspect all targets')}
            </Button>
            <Button
              disabled={model.busy || !model.items.length}
              onClick={() => dispatch({ type: 'refresh' })}
            >
              {text('刷新当前来源', 'Refresh item from source')}
            </Button>
            <Button disabled={!model.busy} onClick={() => dispatch({ type: 'stop' })}>
              {text('停止', 'Stop')}
            </Button>
            <Button data-neo-ui-part="close" onClick={() => dispatch({ type: 'close' })}>
              {text('关闭', 'Close')}
            </Button>
          </div>
          <details>
            <summary>{text('查询线索与可选 BibTeX', 'Query hints and optional BibTeX')}</summary>
            <p>
              {text(
                '使用条目已有标题、作者、年份、出版物和标识符；可补充 BibTeX 的书目字段。citekey 不会当作外部通用标识符。',
                'Uses the item title, authors, year, venue and identifiers; BibTeX can supply additional bibliographic fields. A citekey is not treated as a universal external identifier.',
              )}
            </p>
            <textarea
              aria-label="BibTeX"
              value={model.bibtex}
              disabled={model.busy}
              maxLength={32768}
              onChange={(event) => dispatch({ type: 'bibtex', value: event.currentTarget.value })}
            />
          </details>
          <Status error={model.error}>{model.status}</Status>
          {!!model.candidates.length && (
            <label>
              {text('核对候选论文', 'Review candidate paper')}{' '}
              <select
                data-neo-ui-part="candidate"
                disabled={model.busy}
                value={model.candidateIndex}
                onChange={(event) =>
                  dispatch({ type: 'candidate', index: Number(event.currentTarget.value) })
                }
              >
                <option value={-1}>
                  {text(
                    '请选择；不会自动采用第一项',
                    'Choose explicitly; the first result is not automatically accepted',
                  )}
                </option>
                {model.candidates.map((candidate, index) => (
                  <option key={index} value={index}>
                    {candidate}
                  </option>
                ))}
              </select>
            </label>
          )}
          {model.provenance && (
            <p className="neo-muted" style={{ whiteSpace: 'pre-wrap' }}>
              {model.provenance}
            </p>
          )}
          {!!model.fields.length && (
            <>
              <table className="neo-metadata-fields">
                <thead>
                  <tr>
                    <th>{text('采纳字段', 'Apply field')}</th>
                    <th>{text('审阅原值', 'Reviewed original')}</th>
                    <th>{text('来源建议', 'Source proposal')}</th>
                  </tr>
                </thead>
                <tbody>
                  {model.fields.map((field) => (
                    <tr key={field.field}>
                      <td>
                        <label>
                          <input
                            type="checkbox"
                            checked={field.selected}
                            disabled={model.busy || !model.canEdit}
                            onChange={(event) =>
                              dispatch({
                                type: 'field',
                                field: field.field,
                                checked: event.currentTarget.checked,
                              })
                            }
                          />
                          {field.field}
                        </label>
                        {field.field === 'citationKey' && (
                          <strong>
                            {text(
                              ' 修改可能破坏已有引用',
                              ' Changing this can break existing citations',
                            )}
                          </strong>
                        )}
                      </td>
                      <td>{field.before || '—'}</td>
                      <td>{field.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          <div className="neo-metadata-toolbar">
            <Button
              primary
              disabled={!model.canApply || model.busy}
              onClick={() => dispatch({ type: 'apply' })}
            >
              {text('采纳选中字段', 'Apply selected fields')}
            </Button>
            <Button
              disabled={!model.canSave || model.busy}
              onClick={() => dispatch({ type: 'save' })}
            >
              {text('保存审阅成果与笔记', 'Save review artifact and note')}
            </Button>
          </div>
          <details>
            <summary>
              {text('已有成果／外部建议', 'Saved results / external proposals')} (
              {model.history.length})
            </summary>
            <p>
              {text(
                '外部附件是不可信的建议，不会自动执行。载入后按当前条目重新计算差异，再由你采纳。',
                'External attachments are untrusted proposals, never commands. Loading recomputes differences against the current item for your review.',
              )}
            </p>
            {model.history.map((entry) => (
              <p key={entry.id}>
                <Button
                  disabled={model.busy}
                  onClick={() => dispatch({ type: 'history', id: entry.id })}
                >
                  {entry.title}
                </Button>
              </p>
            ))}
          </details>
        </div>
      );
    },
    initial,
  );
}
