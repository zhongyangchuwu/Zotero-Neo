import { React } from '../runtime';
import { createReactView } from '../view';
import type { ReactView } from '../types';
import type { MainNoticeReactModel } from '../../../main/notice-react-model';

export const MAIN_NOTICE_REACT_CSS = `
.neo-main-notice { position:fixed; bottom:10px; right:14px; z-index:99999; font:bold 12px/1.4 var(--neo-font-mono); padding:2px 8px; border:1px solid var(--zotero-neo-border); border-radius:var(--neo-radius-small); pointer-events:none; user-select:none; box-shadow:var(--neo-shadow); }
.neo-main-notice[data-kind="success"] { color:var(--zotero-neo-status-success-text); background:var(--zotero-neo-status-success); }
.neo-main-notice[data-kind="info"] { color:var(--zotero-neo-status-info-text); background:var(--zotero-neo-status-info); }
.neo-main-notice[data-kind="error"] { color:var(--zotero-neo-status-error-text); background:var(--zotero-neo-status-error); }
`;

export function mountMainNoticeReactView(
  root: HTMLElement,
  initialModel: MainNoticeReactModel,
): ReactView<MainNoticeReactModel> {
  return createReactView(
    root,
    (model) => (
      <div className="neo-main-notice" data-kind={model.kind} hidden={!model.visible}>
        {model.text}
      </div>
    ),
    initialModel,
  );
}
