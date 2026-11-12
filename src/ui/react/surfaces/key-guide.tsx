import type { KeyGuideReactModel } from '../../key-guide-react-model';
import { React } from '../runtime';
import type { ReactView } from '../types';
import { createReactView } from '../view';

export const KEY_GUIDE_REACT_CSS = `
.neo-key-guide { position:fixed; left:50%; bottom:22px; transform:translateX(-50%); z-index:99998; min-width:260px; max-width:min(640px,calc(100vw - 32px)); padding:12px 14px; background:var(--zotero-neo-surface); color:var(--zotero-neo-text); border:1px solid var(--zotero-neo-border); border-radius:6px; box-shadow:0 10px 32px var(--zotero-neo-shadow); font:15px/1.5 monospace; pointer-events:none; user-select:none; }
.neo-key-guide-title { margin-bottom:6px; padding-bottom:5px; border-bottom:1px solid var(--zotero-neo-border); color:var(--zotero-neo-muted); font-weight:bold; }
.neo-key-guide-entries { display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:3px 16px; }
.neo-key-guide-key { display:inline-block; min-width:28px; margin-right:8px; color:var(--zotero-neo-accent); font-weight:bold; }
`;

export function mountKeyGuideReactView(
  root: HTMLElement,
  initialModel: KeyGuideReactModel,
): ReactView<KeyGuideReactModel> {
  return createReactView(
    root,
    (model) => (
      <section className="neo-key-guide" style={{ fontSize: `${model.fontSizePx}px` }}>
        <div className="neo-key-guide-title">{model.prefix}</div>
        <div className="neo-key-guide-entries">
          {model.entries.map((entry, index) => (
            <div key={index}>
              <span className="neo-key-guide-key">{entry.key}</span>
              <span>{entry.label}</span>
            </div>
          ))}
        </div>
      </section>
    ),
    initialModel,
  );
}
