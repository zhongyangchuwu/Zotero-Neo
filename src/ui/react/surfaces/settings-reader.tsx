import { React } from '../runtime';
import {
  READER_SCROLL_NUMBER_SPECS,
  type ReaderScrollNumberSetting,
} from '../../../core/preferences';
import type {
  ReaderCredentialModel,
  ReaderPageCommand,
  ReaderPageModel,
} from '../../../main/settings-reader-model';

const STEPS: Record<ReaderScrollNumberSetting, number> = {
  scrollStep: 10,
  followSpeed: 50,
  initialSpeed: 10,
  maxSpeed: 50,
  acceleration: 100,
  deceleration: 100,
};

type Dispatch = (command: ReaderPageCommand) => void;

function NumberField({
  setting,
  model,
  dispatch,
}: {
  setting: ReaderScrollNumberSetting;
  model: ReaderPageModel;
  dispatch: Dispatch;
}) {
  const [draft, setDraft] = React.useState<string | null>(null);
  const spec = READER_SCROLL_NUMBER_SPECS[setting];
  const label = model.labels.numbers[setting];
  return (
    <label className="neo-reader-row">
      <span>{label}</span>
      <input
        type="number"
        aria-label={label}
        min={spec.minimum}
        max={spec.maximum}
        step={STEPS[setting]}
        value={draft ?? String(model.scroll[setting])}
        onFocus={(event) => setDraft(event.currentTarget.value)}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={(event) => {
          if (event.currentTarget.value !== String(model.scroll[setting]))
            dispatch({ type: 'number', setting, value: event.currentTarget.value });
          setDraft(null);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.currentTarget.blur();
        }}
      />
    </label>
  );
}

function CredentialField({
  provider,
  model,
  dispatch,
}: {
  provider: 'mineru' | 'semanticScholar';
  model: ReaderCredentialModel;
  dispatch: Dispatch;
}) {
  const input = React.useRef<HTMLInputElement>(null);
  const composing = React.useRef(false);
  React.useLayoutEffect(() => {
    const element = input.current;
    dispatch({ type: 'mountCredential', provider });
    return () => {
      if (element) element.value = '';
    };
  }, []);
  return (
    <section className="neo-reader-group">
      <h3>{model.title}</h3>
      <p>{model.hint}</p>
      <label className="neo-reader-row">
        <span>{model.inputLabel}</span>
        <input
          ref={input}
          data-neo-ui-part={`credential-${provider}`}
          type="password"
          autoComplete="off"
          onCompositionStart={() => {
            composing.current = true;
            dispatch({ type: 'credentialEditing', provider });
          }}
          onCompositionEnd={() => {
            composing.current = false;
            dispatch({ type: 'credentialInput', provider });
          }}
          onInput={(event) => {
            if (composing.current || (event.nativeEvent as InputEvent).isComposing) return;
            dispatch({ type: 'credentialInput', provider });
          }}
        />
      </label>
      <div className="neo-reader-actions">
        <button
          type="button"
          disabled={model.checking}
          onClick={() => {
            if (composing.current) return;
            dispatch({ type: 'verifyCredential', provider });
          }}
        >
          {model.verifyLabel}
        </button>
        <a
          href={model.helpURL}
          onClick={(event) => {
            event.preventDefault();
            dispatch({ type: 'credentialHelp', provider });
          }}
        >
          {model.helpLabel}
        </a>
      </div>
      <small role={model.error ? 'alert' : 'status'}>{model.status}</small>
    </section>
  );
}

export function ReaderPage({ model, dispatch }: { model: ReaderPageModel; dispatch: Dispatch }) {
  const l = model.labels;
  const toggle = (
    type: 'visual' | 'comment' | 'marks' | 'stop',
    label: string,
    hint: string,
    checked: boolean,
  ) => (
    <label className="neo-reader-row">
      <span>
        {label}
        <small>{hint}</small>
      </span>
      <span>
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => dispatch({ type, value: event.currentTarget.checked })}
        />{' '}
        {checked ? l.on : l.off}
      </span>
    </label>
  );
  return (
    <div className="neo-settings-reader">
      <h2>{l.title}</h2>
      <section className="neo-reader-group">
        <h3>{l.input}</h3>
        {toggle('visual', l.visual, l.visualHint, model.visual)}
        {toggle('comment', l.comment, l.commentHint, model.comment)}
      </section>
      <section className="neo-reader-group">
        <h3>{l.scrolling}</h3>
        <p>{l.scrollingHint}</p>
        <div className="neo-reader-row">
          <span>{l.mode}</span>
          <div className="neo-reader-actions">
            {(['step', 'follow', 'trapezoid'] as const).map((mode) => (
              <button
                type="button"
                key={mode}
                aria-pressed={model.scroll.mode === mode}
                onClick={() => dispatch({ type: 'mode', value: mode })}
              >
                {l.modes[mode]}
              </button>
            ))}
          </div>
        </div>
        {model.scroll.mode === 'step' && (
          <NumberField setting="scrollStep" model={model} dispatch={dispatch} />
        )}
        {model.scroll.mode === 'follow' && (
          <NumberField setting="followSpeed" model={model} dispatch={dispatch} />
        )}
        {model.scroll.mode === 'trapezoid' && (
          <>
            {(['initialSpeed', 'maxSpeed', 'acceleration', 'deceleration'] as const).map(
              (setting) => (
                <NumberField key={setting} setting={setting} model={model} dispatch={dispatch} />
              ),
            )}
            {toggle('stop', l.stop, l.stopHint, model.scroll.stopOnRelease)}
          </>
        )}
      </section>
      <section className="neo-reader-group">
        <h3>{l.marks}</h3>
        {toggle('marks', l.persist, l.persistHint, model.marks)}
      </section>
      <section className="neo-reader-group">
        <h3>{l.annotations}</h3>
        <p>{l.annotationsHint}</p>
        <div className="neo-reader-row">
          <span>{l.color}</span>
          <div className="neo-reader-actions">
            {(['yellow', 'red', 'green', 'blue', 'purple'] as const).map((color) => (
              <button
                type="button"
                key={color}
                aria-pressed={model.color === color}
                onClick={() => dispatch({ type: 'color', value: color })}
              >
                {l.colors[color]}
              </button>
            ))}
          </div>
        </div>
      </section>
      <p role="status" aria-live="polite" className="neo-reader-error">
        {model.status}
      </p>
      <CredentialField provider="mineru" model={model.mineru} dispatch={dispatch} />
      <CredentialField
        provider="semanticScholar"
        model={model.semanticScholar}
        dispatch={dispatch}
      />
    </div>
  );
}

export const READER_REACT_CSS = `
.neo-settings-reader { padding: 16px 20px; overflow: auto; }
.neo-settings-reader h2 { margin: 0 0 .55em; font-size: 1.55em; }
.neo-settings-reader .neo-reader-group { margin: 0 0 1.2em; }
.neo-settings-reader h3 { margin: 0 0 .4em; }
.neo-settings-reader p { margin: .3em 0 .6em; }
.neo-settings-reader .neo-reader-row { display: flex; align-items: center; justify-content: space-between; gap: 1em; margin: .5em 0; }
.neo-settings-reader .neo-reader-row small { display: block; color: var(--zotero-neo-muted); }
.neo-settings-reader .neo-reader-actions { display: flex; flex-wrap: wrap; gap: .4em; }
.neo-settings-reader .neo-reader-error { color: var(--zotero-neo-error); }
`;
