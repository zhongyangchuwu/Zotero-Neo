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
          <h2>{text('补全论文信息', 'Complete paper details')}</h2>
          <p className="neo-muted">
            {text(
              '检查打开时选定的论文。可以一次补全匹配条目的空字段，不会覆盖已有值或改动引用键。',
              'Check the papers selected when this panel opened, then fill missing fields in matched items without overwriting existing values or changing citation keys.',
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
              primary
              disabled={model.busy || !model.items.length}
              onClick={() => dispatch({ type: model.items.length > 1 ? 'inspect-all' : 'inspect' })}
            >
              {model.items.length > 1
                ? text(`检查 ${model.items.length} 篇论文`, `Check ${model.items.length} papers`)
                : text('检查论文信息', 'Check paper details')}
            </Button>
            {model.querying && (
              <Button onClick={() => dispatch({ type: 'stop' })}>{text('停止', 'Stop')}</Button>
            )}
            <Button data-neo-ui-part="close" onClick={() => dispatch({ type: 'close' })}>
              {text('关闭', 'Close')}
            </Button>
          </div>
          {model.fillCount > 0 && (
            <p>
              <Button primary disabled={model.busy} onClick={() => dispatch({ type: 'fill' })}>
                {text(
                  `补全 ${model.fillCount} 篇论文的空字段`,
                  `Fill missing fields in ${model.fillCount} ${model.fillCount === 1 ? 'paper' : 'papers'}`,
                )}
              </Button>
            </p>
          )}
          {model.batchStatus && <Status>{model.batchStatus}</Status>}
          <details>
            <summary>{text('查询选项与 BibTeX', 'Query options and BibTeX')}</summary>
            <div className="neo-metadata-toolbar">
              {model.items.length > 1 && (
                <Button disabled={model.busy} onClick={() => dispatch({ type: 'inspect' })}>
                  {text('只检查当前条目', 'Check only this item')}
                </Button>
              )}
              <Button
                disabled={model.busy || !model.items.length}
                onClick={() => dispatch({ type: 'refresh' })}
              >
                {text('从来源重新查询', 'Query source again')}
              </Button>
            </div>
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
            <details key={model.itemIndex}>
              <summary>{text('查看差异或选择字段', 'See changes or choose fields')}</summary>
              <table className="neo-metadata-fields">
                <thead>
                  <tr>
                    <th>{text('更新字段', 'Field to update')}</th>
                    <th>{text('检查时的值', 'Value when checked')}</th>
                    <th>{text('建议值', 'Suggested value')}</th>
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
              <Button
                disabled={!model.canApply || model.busy}
                onClick={() => dispatch({ type: 'apply' })}
              >
                {text('更新当前条目勾选的字段', 'Update selected fields in this item')}
              </Button>
            </details>
          )}
          <details
            key={`history:${model.itemIndex}`}
            onToggle={(event) => {
              if (event.currentTarget.open)
                dispatch({ type: 'load-history', index: model.itemIndex });
            }}
          >
            <summary>
              {text('记录与外部建议（可选）', 'Saved results and external suggestions (optional)')}
            </summary>
            <Button
              disabled={!model.canSave || model.busy}
              onClick={() => dispatch({ type: 'save' })}
            >
              {text('保存当前结果和笔记', 'Save this result and note')}
            </Button>
            {model.historyStatus && (
              <Status error={model.historyError}>{model.historyStatus}</Status>
            )}
            <p>
              {text(
                '打开结果或建议时，会与条目现有信息重新比较，不会自动更新字段。',
                'Opening results or suggestions compares them with the current item. No fields are updated automatically.',
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
