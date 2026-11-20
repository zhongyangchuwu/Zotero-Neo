import type { MainStatusReactModel } from '../../../modules/worksets/status-react-model';
import { React } from '../runtime';
import type { ReactView } from '../types';
import { createReactView } from '../view';

export const MAIN_STATUS_REACT_CSS = `
.neo-main-status { position:fixed; bottom:10px; left:50%; transform:translateX(-50%); z-index:99998; font:600 12px/1.4 var(--neo-font-mono); padding:3px 9px; border:1px solid var(--neo-border); background:var(--neo-surface-subtle); color:var(--neo-fg); border-radius:var(--neo-radius-small); box-shadow:var(--neo-shadow); pointer-events:none; user-select:none; display:block; }
`;

export function mountMainStatusReactView(
  root: HTMLElement,
  initialModel: MainStatusReactModel,
): ReactView<MainStatusReactModel> {
  return createReactView(
    root,
    ({ status, colors, tinted }) => (
      <div
        className="neo-main-status"
        style={
          tinted
            ? {
                borderColor: colors.border,
                background: colors.background,
                color: colors.foreground,
              }
            : undefined
        }
      >
        {status.kind === 'message' ? (
          <span className="zotero-neo-status-message">{status.text}</span>
        ) : status.kind === 'selection' ? (
          <>
            <span className="zotero-neo-status-selection" style={{ color: colors.selectionPrefix }}>
              SEL
            </span>
            <span className="zotero-neo-status-detail">{` ${status.total} · ${status.visible} visible${status.total > status.visible ? ` · ${status.total - status.visible} hidden` : ''}`}</span>
          </>
        ) : (
          <>
            <span className="zotero-neo-status-visual" style={{ color: colors.visualPrefix }}>
              VISUAL
            </span>
            <span className="zotero-neo-status-detail">{` ${status.targetCount} · `}</span>
            <span className="zotero-neo-status-selection" style={{ color: colors.selectionPrefix }}>
              SEL
            </span>
            <span className="zotero-neo-status-detail">{` ${status.selectionCount}`}</span>
          </>
        )}
      </div>
    ),
    initialModel,
  );
}
