import { React, createRoot } from '../../../vendor/react/index.js';
import { compositionOwnsKey } from '../../input/composition';
import type { AIConfiguration } from '../../ai/contracts';
import type { ReaderAIEvidence, ReaderAIRecord, ReaderAITaskPhase } from '../contracts';
import type {
  ReaderAICommand,
  ReaderAIView,
  ReaderAIViewModel,
  ReaderAIUIRuntime,
} from '../view-contracts';
const MAX_QUESTION_LENGTH = 4000;

const CSS = `
.neo-reader-ai, .neo-reader-ai * { box-sizing: border-box; }
.neo-reader-ai {
  color: var(--zotero-neo-text);
  background: var(--zotero-neo-surface);
  border: 1px solid var(--zotero-neo-border);
  border-radius: 8px;
  font: inherit;
  line-height: 1.45;
  max-height: 100%;
  overflow: auto;
  padding: 14px;
}
.neo-reader-ai button, .neo-reader-ai input, .neo-reader-ai select, .neo-reader-ai textarea { font: inherit; }
.neo-reader-ai button {
  background: var(--zotero-neo-elevated);
  border: 1px solid var(--zotero-neo-border);
  border-radius: 5px;
  color: var(--zotero-neo-text);
  cursor: pointer;
  padding: 5px 9px;
}
.neo-reader-ai button:hover:not(:disabled) { border-color: var(--zotero-neo-accent); }
.neo-reader-ai button:focus-visible, .neo-reader-ai input:focus-visible, .neo-reader-ai select:focus-visible,
.neo-reader-ai textarea:focus-visible, .neo-reader-ai [tabindex='0']:focus-visible {
  outline: 2px solid var(--zotero-neo-focus-ring);
  outline-offset: 2px;
}
.neo-reader-ai button:disabled { cursor: not-allowed; opacity: .55; }
.neo-reader-ai input, .neo-reader-ai select, .neo-reader-ai textarea {
  background: var(--zotero-neo-input);
  border: 1px solid var(--zotero-neo-border);
  border-radius: 5px;
  color: var(--zotero-neo-text);
  min-width: 0;
  padding: 6px 8px;
  width: 100%;
}
.neo-reader-ai textarea { min-height: 72px; resize: vertical; }
.neo-reader-ai label { display: grid; gap: 4px; }
.neo-reader-ai h2, .neo-reader-ai h3, .neo-reader-ai p { margin: 0; }
.neo-reader-ai h2 { font-size: 1.1em; }
.neo-reader-ai h3 { font-size: 1em; }
.neo-reader-ai-header, .neo-reader-ai-actions, .neo-reader-ai-chips, .neo-reader-ai-statuses {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
.neo-reader-ai-header { justify-content: space-between; margin-bottom: 12px; }
.neo-reader-ai-form, .neo-reader-ai-result, .neo-reader-ai-preview { display: grid; gap: 10px; }
.neo-reader-ai-controls { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr)); }
.neo-reader-ai-check { align-items: center; display: flex !important; gap: 8px !important; }
.neo-reader-ai-check input { width: auto; }
.neo-reader-ai-section, .neo-reader-ai-result, .neo-reader-ai-preview {
  border: 1px solid var(--zotero-neo-border);
  border-radius: 6px;
  margin-top: 12px;
  padding: 10px;
}
.neo-reader-ai-status { border-radius: 5px; padding: 7px 9px; }
.neo-reader-ai-status-info { background: var(--zotero-neo-status-info); color: var(--zotero-neo-status-info-text); }
.neo-reader-ai-status-success { background: var(--zotero-neo-status-success); color: var(--zotero-neo-status-success-text); }
.neo-reader-ai-status-error { background: var(--zotero-neo-status-error); color: var(--zotero-neo-status-error-text); }
.neo-reader-ai-muted { color: var(--zotero-neo-muted); }
.neo-reader-ai-chip { border-radius: 999px !important; font-size: .9em !important; }
.neo-reader-ai-chip[aria-pressed='true'] { background: var(--zotero-neo-selected); color: var(--zotero-neo-selected-text); }
.neo-reader-ai-output { overflow-wrap: anywhere; white-space: pre-wrap; }
.neo-reader-ai-guide { border-inline-start: 2px solid var(--zotero-neo-border); display: grid; gap: 5px; padding-inline-start: 9px; }
.neo-reader-ai-results { outline: none; }
.neo-reader-ai-result[aria-current='true'] { border-color: var(--zotero-neo-accent); }
.neo-reader-ai-preview img { height: auto; max-height: 240px; max-width: 100%; object-fit: contain; }
.neo-reader-ai-inline-confirm { align-items: center; display: flex; flex-wrap: wrap; gap: 7px; }
`;

type Dispatch = (command: ReaderAICommand) => void;
type Labels = ReaderAIViewModel['labels'];

function generatedText(record: ReaderAIRecord): string {
  return record.output.paragraphs.map((paragraph) => paragraph.text).join('\n\n');
}

function safeImageDataURL(value: string | null): string | null {
  return value && /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
    ? value
    : null;
}

function canJump(sourceCurrent: boolean, evidence: ReaderAIEvidence): boolean {
  return sourceCurrent && evidence.location !== null;
}

function phaseText(phase: ReaderAITaskPhase, labels: Labels): string | null {
  switch (phase) {
    case 'preparing':
      return labels.preparing;
    case 'requesting':
      return labels.requesting;
    case 'saving':
      return labels.saving;
    case 'complete':
      return labels.complete;
    case 'failed':
      return labels.failed;
    case 'cancelled':
      return labels.cancelled;
    case 'idle':
      return null;
  }
}

interface ResultCardProps {
  readonly record: ReaderAIRecord;
  readonly sourceCurrent: boolean;
  readonly activeEvidenceID: string | null;
  readonly previewEvidenceID: string | null;
  readonly labels: Labels;
  readonly dispatch: Dispatch;
  readonly onPreview: (resultID: string, evidenceID: string) => void;
  readonly onJump: (resultID: string, evidenceID: string) => void;
}

const ResultCard = React.memo(function ResultCard({
  record,
  sourceCurrent,
  activeEvidenceID,
  previewEvidenceID,
  labels,
  dispatch,
  onPreview,
  onJump,
}: ResultCardProps) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [editRevision, setEditRevision] = React.useState(record.revision);
  const [confirmRevision, setConfirmRevision] = React.useState<number | null>(null);
  const original = generatedText(record);

  React.useEffect(() => {
    if (editing && record.revision !== editRevision && record.userText === draft) setEditing(false);
  }, [draft, editing, editRevision, record.revision, record.userText]);
  function beginEdit(): void {
    setEditRevision(record.revision);
    setDraft(record.userText ?? original);
    setEditing(true);
  }

  return (
    <article className="neo-reader-ai-result" aria-current={activeEvidenceID !== null}>
      <div className="neo-reader-ai-header">
        <h3>{record.contextTitle || record.source.fileName}</h3>
        <div className="neo-reader-ai-statuses">
          <span className="neo-reader-ai-chip">
            {record.userText === null ? labels.generated : labels.modified}
          </span>
          {!sourceCurrent && <span className="neo-reader-ai-chip">{labels.sourceChanged}</span>}
        </div>
      </div>
      {record.question && (
        <p className="neo-reader-ai-muted">
          {labels.question}: {record.question}
        </p>
      )}
      <div>
        <strong>{labels.original}</strong>
        <div className="neo-reader-ai-output">{original}</div>
      </div>
      {record.userText !== null && (
        <div>
          <strong>{labels.myText}</strong>
          <div className="neo-reader-ai-output">{record.userText}</div>
        </div>
      )}
      {record.kind === 'guide' && record.output.guide.length > 0 && (
        <section className="neo-reader-ai-section" aria-label={labels.prepareGuide}>
          <h3>{labels.prepareGuide}</h3>
          {record.output.guide.map((entry, index) => {
            const evidence = record.evidence.find((candidate) => candidate.id === entry.evidenceID);
            if (!evidence) {
              return (
                <p className="neo-reader-ai-muted" key={`${entry.evidenceID}:${index}`}>
                  {labels.evidenceUnavailable}
                </p>
              );
            }
            return (
              <div className="neo-reader-ai-guide" key={`${entry.evidenceID}:${index}`}>
                <strong>{evidence.title}</strong>
                <p className="neo-reader-ai-output">{evidence.text}</p>
                <p>{entry.reason}</p>
              </div>
            );
          })}
        </section>
      )}
      <div className="neo-reader-ai-chips" aria-label={labels.source}>
        {record.evidence.map((evidence) => {
          const isActive = activeEvidenceID === evidence.id;
          const title = evidence.pageLabel
            ? `${evidence.title} · ${evidence.pageLabel}`
            : evidence.title;
          return (
            <React.Fragment key={evidence.id}>
              <button
                className="neo-reader-ai-chip"
                type="button"
                aria-label={`${labels.preview}: ${title}`}
                aria-pressed={isActive}
                onClick={() => onPreview(record.id, evidence.id)}
              >
                {title || labels.source}
              </button>
              <button
                type="button"
                disabled={previewEvidenceID !== evidence.id || !canJump(sourceCurrent, evidence)}
                aria-label={`${labels.jump}: ${title}`}
                onClick={() => onJump(record.id, evidence.id)}
              >
                {labels.jump}
              </button>
            </React.Fragment>
          );
        })}
      </div>
      {editing ? (
        <form
          className="neo-reader-ai-form"
          onSubmit={(event) => {
            event.preventDefault();
            dispatch({ type: 'edit', resultID: record.id, revision: editRevision, text: draft });
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !compositionOwnsKey(event.nativeEvent, false)) {
              event.preventDefault();
              event.stopPropagation();
              setEditing(false);
            }
          }}
        >
          <label>
            {labels.edit}
            <textarea value={draft} onChange={(event) => setDraft(event.currentTarget.value)} />
          </label>
          <div className="neo-reader-ai-actions">
            <button type="submit">{labels.saveEdit}</button>
            <button type="button" onClick={() => setEditing(false)}>
              {labels.cancelEdit}
            </button>
          </div>
        </form>
      ) : (
        <div className="neo-reader-ai-actions">
          <button type="button" onClick={beginEdit}>
            {labels.edit}
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: 'save-note', resultID: record.id })}
          >
            {labels.saveNote}
          </button>
          {confirmRevision === null ? (
            <button type="button" onClick={() => setConfirmRevision(record.revision)}>
              {labels.remove}
            </button>
          ) : (
            <div
              className="neo-reader-ai-inline-confirm"
              role="group"
              aria-label={labels.confirmRemove}
            >
              <span>{labels.confirmRemove}</span>
              <button
                type="button"
                onClick={() => {
                  dispatch({ type: 'remove', resultID: record.id, revision: confirmRevision });
                  setConfirmRevision(null);
                }}
              >
                {labels.remove}
              </button>
              <button type="button" onClick={() => setConfirmRevision(null)}>
                {labels.cancel}
              </button>
            </div>
          )}
        </div>
      )}
      {!editing && !sourceCurrent && <p className="neo-reader-ai-muted">{labels.stale}</p>}
    </article>
  );
});

interface ReaderAIAppProps {
  readonly model: ReaderAIViewModel;
  readonly dispatch: Dispatch;
}

function ReaderAIApp({ model, dispatch }: ReaderAIAppProps): React.ReactElement {
  const labels = model.labels;
  const [question, setQuestion] = React.useState('');
  const [configurationOpen, setConfigurationOpen] = React.useState(!model.configuration.configured);
  const [endpoint, setEndpoint] = React.useState(model.configuration.endpoint);
  const [modelName, setModelName] = React.useState(model.configuration.model);
  const [maxTokens, setMaxTokens] = React.useState(String(model.configuration.maxOutputTokens));
  const [sendImages, setSendImages] = React.useState(model.configuration.sendImages);
  const [password, setPassword] = React.useState('');
  const [forgetKey, setForgetKey] = React.useState(false);
  const [configurationDirty, setConfigurationDirty] = React.useState(false);
  const [cursor, setCursor] = React.useState<{ resultID: string; evidenceID: string } | null>(null);
  const resultList = React.useRef<HTMLElement | null>(null);
  const entries = React.useMemo(
    () =>
      model.records.flatMap(({ record }) =>
        record.evidence.map((evidence) => ({ record, evidence })),
      ),
    [model.records],
  );
  const currentEntry =
    cursor === null
      ? null
      : (entries.find(
          ({ record, evidence }) =>
            record.id === cursor.resultID && evidence.id === cursor.evidenceID,
        ) ?? null);
  const busy =
    model.task.phase === 'preparing' ||
    model.task.phase === 'requesting' ||
    model.task.phase === 'saving';
  const phase = phaseText(model.task.phase, labels);
  const previewImage = model.preview === null ? null : safeImageDataURL(model.preview.imageDataURL);

  React.useEffect(() => {
    if (!configurationDirty) {
      setEndpoint(model.configuration.endpoint);
      setModelName(model.configuration.model);
      setMaxTokens(String(model.configuration.maxOutputTokens));
      setSendImages(model.configuration.sendImages);
    }
  }, [configurationDirty, model.configuration]);

  const closeConfiguration = React.useCallback(() => {
    setConfigurationOpen(false);
    setPassword('');
    setForgetKey(false);
    setEndpoint(model.configuration.endpoint);
    setModelName(model.configuration.model);
    setMaxTokens(String(model.configuration.maxOutputTokens));
    setSendImages(model.configuration.sendImages);
    setConfigurationDirty(false);
  }, [model.configuration]);

  const closeReaderAI = React.useCallback(() => {
    setPassword('');
    setForgetKey(false);
    dispatch({ type: 'close' });
  }, [dispatch]);

  const handlePreview = React.useCallback(
    (resultID: string, evidenceID: string) => {
      setCursor({ resultID, evidenceID });
      dispatch({ type: 'preview', resultID, evidenceID });
    },
    [dispatch],
  );

  const handleJump = React.useCallback(
    (resultID: string, evidenceID: string) => {
      const entry = entries.find(
        (candidate) => candidate.record.id === resultID && candidate.evidence.id === evidenceID,
      );
      const view = entry && model.records.find((candidate) => candidate.record.id === resultID);
      if (
        !entry ||
        !view ||
        !canJump(view.sourceCurrent, entry.evidence) ||
        model.preview?.id !== `${resultID}/${evidenceID}`
      )
        return;
      dispatch({ type: 'jump', resultID, evidenceID });
    },
    [dispatch, entries, model.records, model.preview?.id],
  );

  function onAppKeyDown(event: React.KeyboardEvent<HTMLElement>): void {
    if (compositionOwnsKey(event.nativeEvent, false)) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (configurationOpen) closeConfiguration();
      else closeReaderAI();
      return;
    }
    if (!resultList.current?.contains(target)) return;
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (event.key === 'j' || event.key === 'k') {
      if (entries.length === 0) return;
      event.preventDefault();
      const index = currentEntry
        ? entries.findIndex(
            ({ record, evidence }) =>
              record.id === currentEntry.record.id && evidence.id === currentEntry.evidence.id,
          )
        : -1;
      const nextIndex =
        index < 0
          ? event.key === 'j'
            ? 0
            : entries.length - 1
          : (index + (event.key === 'j' ? 1 : -1) + entries.length) % entries.length;
      const next = entries[nextIndex];
      handlePreview(next.record.id, next.evidence.id);
      return;
    }
    if (event.key === 'Enter' && target === resultList.current && currentEntry) {
      event.preventDefault();
      handleJump(currentEntry.record.id, currentEntry.evidence.id);
    }
  }

  function submitConfiguration(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const parsedMaxTokens = Number(maxTokens);
    if (
      !Number.isInteger(parsedMaxTokens) ||
      parsedMaxTokens < 1 ||
      !endpoint.trim() ||
      !modelName.trim()
    )
      return;
    const configuration: AIConfiguration = {
      endpoint: endpoint.trim(),
      model: modelName.trim(),
      maxOutputTokens: parsedMaxTokens,
      sendImages,
    };
    dispatch({
      type: 'configure',
      configuration,
      key: forgetKey ? '' : password,
      forget: forgetKey,
    });
    setPassword('');
    setForgetKey(false);
    setConfigurationOpen(false);
    setConfigurationDirty(false);
  }

  return (
    <section className="neo-reader-ai" aria-label={labels.title} onKeyDown={onAppKeyDown}>
      <style>{CSS}</style>
      <header className="neo-reader-ai-header">
        <h2>{labels.title}</h2>
        <div className="neo-reader-ai-actions">
          <button
            type="button"
            onClick={() => {
              if (configurationOpen) closeConfiguration();
              else setConfigurationOpen(true);
            }}
            aria-expanded={configurationOpen}
          >
            {labels.configure}
          </button>
          <button type="button" onClick={closeReaderAI}>
            {labels.close}
          </button>
        </div>
      </header>

      {!model.configuration.configured && (
        <p className="neo-reader-ai-status neo-reader-ai-status-info">{labels.unconfigured}</p>
      )}
      {model.loading && (
        <p className="neo-reader-ai-status neo-reader-ai-status-info" role="status">
          {labels.loading}
        </p>
      )}
      {model.error && (
        <p className="neo-reader-ai-status neo-reader-ai-status-error" role="alert">
          {model.error}
        </p>
      )}
      {model.notice && (
        <p className="neo-reader-ai-status neo-reader-ai-status-success" role="status">
          {model.notice}
        </p>
      )}
      {phase && (
        <p
          className={`neo-reader-ai-status ${model.task.phase === 'failed' ? 'neo-reader-ai-status-error' : 'neo-reader-ai-status-info'}`}
          role="status"
        >
          {phase}
        </p>
      )}
      {model.limitedContext && (
        <p className="neo-reader-ai-status neo-reader-ai-status-info">{labels.limitedContext}</p>
      )}

      {configurationOpen && (
        <form
          className="neo-reader-ai-section neo-reader-ai-form"
          onSubmit={submitConfiguration}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !compositionOwnsKey(event.nativeEvent, false)) {
              event.preventDefault();
              event.stopPropagation();
              closeConfiguration();
            }
          }}
        >
          <h3>{labels.configure}</h3>
          <div className="neo-reader-ai-controls">
            <label>
              {labels.endpoint}
              <input
                type="url"
                required
                maxLength={2048}
                value={endpoint}
                onChange={(event) => {
                  setEndpoint(event.currentTarget.value);
                  setConfigurationDirty(true);
                }}
              />
            </label>
            <label>
              {labels.model}
              <input
                type="text"
                required
                maxLength={256}
                value={modelName}
                onChange={(event) => {
                  setModelName(event.currentTarget.value);
                  setConfigurationDirty(true);
                }}
              />
            </label>
            <label>
              {labels.maxOutputTokens}
              <input
                type="number"
                min={1}
                step={1}
                required
                value={maxTokens}
                onChange={(event) => {
                  setMaxTokens(event.currentTarget.value);
                  setConfigurationDirty(true);
                }}
              />
            </label>
          </div>
          <label className="neo-reader-ai-check">
            <input
              type="checkbox"
              checked={sendImages}
              onChange={(event) => {
                setSendImages(event.currentTarget.checked);
                setConfigurationDirty(true);
              }}
            />
            {labels.sendImages}
          </label>
          <label>
            {labels.key}
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              disabled={forgetKey}
              onChange={(event) => setPassword(event.currentTarget.value)}
            />
          </label>
          {model.configuration.hasCredential && (
            <p className="neo-reader-ai-muted">
              {labels.storedKey}. {labels.keyHint}
            </p>
          )}
          {model.configuration.hasCredential && (
            <label className="neo-reader-ai-check">
              <input
                type="checkbox"
                checked={forgetKey}
                onChange={(event) => {
                  const shouldForget = event.currentTarget.checked;
                  setForgetKey(shouldForget);
                  if (shouldForget) setPassword('');
                }}
              />
              {labels.forgetKey}
            </label>
          )}
          <div className="neo-reader-ai-actions">
            <button type="submit">{labels.saveSettings}</button>
            <button type="button" onClick={closeConfiguration}>
              {labels.cancel}
            </button>
          </div>
        </form>
      )}

      <section
        className="neo-reader-ai-section neo-reader-ai-form"
        aria-label={model.hasSelection ? labels.selection : labels.chapter}
      >
        {model.source ? (
          <>
            <p>
              {labels.source}: {model.source.fileName}
            </p>
            <p>
              {model.hasSelection ? labels.selection : labels.chapter}:{' '}
              {model.contextTitle || model.source.fileName}
            </p>
            {!model.hasSelection && <p className="neo-reader-ai-muted">{labels.noSelection}</p>}
            {model.sections.length > 0 && (
              <label>
                {labels.chapter}
                <select
                  value={model.selectedSectionID ?? ''}
                  onChange={(event) =>
                    dispatch({ type: 'select-section', id: event.currentTarget.value })
                  }
                >
                  {model.selectedSectionID === null && (
                    <option value="" disabled>
                      {labels.chapter}
                    </option>
                  )}
                  {model.sections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        ) : (
          <p className="neo-reader-ai-muted">{labels.noSource}</p>
        )}
        <div className="neo-reader-ai-actions">
          <button
            type="button"
            disabled={!model.configuration.configured || !model.source || busy || model.loading}
            onClick={() => dispatch({ type: 'explain' })}
          >
            {labels.explain}
          </button>
          {busy && (
            <button type="button" onClick={() => dispatch({ type: 'cancel' })}>
              {labels.cancel}
            </button>
          )}
        </div>
        <form
          className="neo-reader-ai-form"
          onSubmit={(event) => {
            event.preventDefault();
            const value = question.trim();
            if (
              !value ||
              value.length > MAX_QUESTION_LENGTH ||
              busy ||
              model.loading ||
              !model.source ||
              !model.configuration.configured
            )
              return;
            dispatch({ type: 'ask', question: value });
          }}
        >
          <label>
            {labels.question}
            <textarea
              value={question}
              maxLength={MAX_QUESTION_LENGTH}
              onChange={(event) => setQuestion(event.currentTarget.value)}
            />
          </label>
          <button
            type="submit"
            disabled={
              !question.trim() ||
              busy ||
              !model.source ||
              !model.configuration.configured ||
              model.loading
            }
          >
            {labels.ask}
          </button>
        </form>
        <button
          type="button"
          disabled={!model.configuration.configured || !model.source || busy || model.loading}
          onClick={() => dispatch({ type: 'guide' })}
        >
          {labels.prepareGuide}
        </button>
      </section>

      <section
        className="neo-reader-ai-section neo-reader-ai-results"
        aria-label={labels.title}
        tabIndex={0}
        ref={resultList}
      >
        {model.records.length === 0 ? (
          <p className="neo-reader-ai-muted">{labels.noRecords}</p>
        ) : (
          model.records.map(({ record, sourceCurrent }) => (
            <ResultCard
              key={record.id}
              record={record}
              sourceCurrent={sourceCurrent}
              activeEvidenceID={
                currentEntry?.record.id === record.id ? currentEntry.evidence.id : null
              }
              previewEvidenceID={
                currentEntry?.record.id === record.id &&
                model.preview?.id === `${record.id}/${currentEntry.evidence.id}`
                  ? currentEntry.evidence.id
                  : null
              }
              labels={labels}
              dispatch={dispatch}
              onPreview={handlePreview}
              onJump={handleJump}
            />
          ))
        )}
      </section>

      {model.preview && (
        <aside className="neo-reader-ai-preview" aria-label={labels.preview}>
          <h3>{model.preview.title || labels.preview}</h3>
          <p className="neo-reader-ai-output">{model.preview.text}</p>
          {previewImage && <img src={previewImage} alt={model.preview.title || labels.preview} />}
        </aside>
      )}
    </section>
  );
}

const runtime: ReaderAIUIRuntime = {
  mount(root, model, dispatch): ReaderAIView {
    const reactRoot = createRoot(root);
    let disposed = false;
    reactRoot.render(<ReaderAIApp model={model} dispatch={dispatch} />);
    return {
      update(nextModel): void {
        if (!disposed) reactRoot.render(<ReaderAIApp model={nextModel} dispatch={dispatch} />);
      },
      dispose(): void {
        if (disposed) return;
        disposed = true;
        reactRoot.unmount();
      },
    };
  },
};

declare global {
  var NeoReaderAIUI: ReaderAIUIRuntime | undefined;
}

globalThis.NeoReaderAIUI = runtime;
