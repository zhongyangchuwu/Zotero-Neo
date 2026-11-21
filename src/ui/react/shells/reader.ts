import { THEME_VARS } from '../../theme';

export const ANNOTATION_COMMENT_OVERLAY_STYLE = `position:fixed;left:50%;bottom:14px;transform:translateX(-50%);width:min(560px,92%);z-index:99998;background:${THEME_VARS.surface};color:${THEME_VARS.text};border:1px solid ${THEME_VARS.border};border-radius:var(--neo-radius);box-shadow:var(--neo-shadow)`;
export const FIGURES_BACKDROP_STYLE = `position:fixed;inset:0;z-index:2147483645;background:${THEME_VARS.backdrop}`;
export const COMPARISON_BACKDROP_STYLE = `position:fixed;inset:0;z-index:2147483644;background:${THEME_VARS.backdrop}`;
export const COMPARISON_PANEL_STYLE = `position:fixed;inset:5%;z-index:2147483645;overflow:auto;padding:20px;background:${THEME_VARS.surface};color:${THEME_VARS.text};border:1px solid ${THEME_VARS.border};border-radius:8px;box-shadow:0 8px 40px #0006;font:menu`;
export const PREPARATION_BACKDROP_STYLE = `position:fixed;inset:0;z-index:2147483646;background:${THEME_VARS.backdrop};display:flex;align-items:center;justify-content:center`;
export const PREPARATION_PANEL_STYLE = `display:flex;flex-direction:column;gap:10px;padding:18px;width:min(880px,90vw);max-height:90vh;overflow:auto;background:${THEME_VARS.surface};color:${THEME_VARS.text};border:1px solid ${THEME_VARS.border};border-radius:8px;font:menu`;
export const SELECTION_ACTIONS_OVERLAY_STYLE = `position:fixed;right:16px;bottom:52px;z-index:100002;width:min(430px,calc(100vw - 32px));max-height:min(70vh,560px);overflow:auto;padding:10px;border:1px solid ${THEME_VARS.border};border-radius:var(--neo-radius);background:${THEME_VARS.surface};color:${THEME_VARS.text};box-shadow:var(--neo-shadow);pointer-events:none;`;
export const REFERENCES_PANEL_STYLE = `position:fixed;z-index:2147483645;left:20px;top:50px;width:420px;max-width:calc(100vw - 24px);max-height:65vh;box-sizing:border-box;overflow:auto;overscroll-behavior:contain;padding:12px;background:${THEME_VARS.surface};color:${THEME_VARS.text};border:1px solid ${THEME_VARS.border};border-radius:6px;font:menu`;
const PDF_BADGE_STYLE = `position:fixed;background:${THEME_VARS.surface};color:${THEME_VARS.text};padding:1px 3px;border:1px solid var(--neo-accent);border-radius:var(--neo-radius-small);font:bold 10px/1.2 var(--neo-font-mono);pointer-events:none;`;
export const PDF_HINT_BADGE_STYLE = `${PDF_BADGE_STYLE}z-index:99999;`;
export const PDF_HINT_PROMPT_STYLE = `${PDF_HINT_BADGE_STYLE}top:4px;right:4px;padding:3px 6px;`;
export const PDF_FLASH_HINT_STYLE = `${PDF_BADGE_STYLE}z-index:100000;`;
export const PDF_FLASH_INPUT_STYLE = `position:fixed;left:12px;bottom:46px;z-index:100001;width:min(360px,calc(100vw - 24px));box-sizing:border-box;padding:7px 9px;border:1px solid ${THEME_VARS.focusRing};border-radius:var(--neo-radius-small);background:${THEME_VARS.input};color:${THEME_VARS.text};outline:1px solid ${THEME_VARS.focusRing};outline-offset:-2px;font:13px/1.2 var(--neo-font-mono);box-shadow:var(--neo-shadow);`;
export const PDF_FLASH_PROMPT_STYLE = `position:fixed;left:12px;bottom:12px;z-index:100001;padding:6px 9px;border:1px solid var(--neo-accent);border-radius:var(--neo-radius-small);background:${THEME_VARS.elevated};color:${THEME_VARS.text};font:bold 12px var(--neo-font-mono);box-shadow:var(--neo-shadow);pointer-events:none;`;
export const PDF_SELECTION_CURSOR_STYLE =
  'position:fixed;z-index:9998;pointer-events:none;outline:1px solid var(--neo-accent,Highlight);outline-offset:1px;background:color-mix(in srgb,var(--neo-accent,Highlight) 16%,transparent);border-radius:var(--neo-radius-small,2px);';
export const PDF_LINK_CUE_STYLE = `position:fixed;z-index:99998;background:color-mix(in srgb,${THEME_VARS.error} 26%,transparent);outline:1px solid ${THEME_VARS.error};outline-offset:-1px;pointer-events:none;`;
