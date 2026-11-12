import type { ReaderStatusReactModel } from '../../../reader/status-react-model';
import { THEME_VARS } from '../../theme';
import { React } from '../runtime';
import { createReactView } from '../view';
import type { ReactView } from '../types';

export const READER_STATUS_REACT_CSS = `
.neo-reader-status { position:fixed; bottom:10px; right:14px; z-index:9999; padding:4px 8px; border:1px solid ${THEME_VARS.border}; border-radius:4px; box-shadow:0 4px 16px ${THEME_VARS.shadow}; font:12px monospace; pointer-events:none; }
.neo-reader-status[hidden] { display:none; }
.neo-reader-status[data-kind="normal"] { color:${THEME_VARS.modeNormalText}; background:${THEME_VARS.modeNormal}; }
.neo-reader-status[data-kind="visual"] { color:${THEME_VARS.modeVisualText}; background:${THEME_VARS.modeVisual}; }
.neo-reader-status[data-kind="insert"] { color:${THEME_VARS.modeInsertText}; background:${THEME_VARS.modeInsert}; }
.neo-reader-status[data-kind="success"] { color:${THEME_VARS.statusSuccessText}; background:${THEME_VARS.statusSuccess}; }
.neo-reader-status[data-kind="info"] { color:${THEME_VARS.statusInfoText}; background:${THEME_VARS.statusInfo}; }
.neo-reader-status[data-kind="error"] { color:${THEME_VARS.statusErrorText}; background:${THEME_VARS.statusError}; }
`;

export function mountReaderStatusReactView(
  root: HTMLElement,
  initialModel: ReaderStatusReactModel,
): ReactView<ReaderStatusReactModel> {
  return createReactView(
    root,
    (model) => (
      <div className="neo-reader-status" data-kind={model.kind} hidden={!model.visible}>
        {model.text}
      </div>
    ),
    initialModel,
  );
}
