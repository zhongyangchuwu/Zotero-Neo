import { THEME_VARS } from '../../theme';

export const ANNOTATION_COMMENT_OVERLAY_STYLE = `position:fixed;left:50%;bottom:14px;transform:translateX(-50%);width:min(560px,92%);z-index:99998;background:${THEME_VARS.surface};color:${THEME_VARS.text};border:1px solid ${THEME_VARS.border};border-radius:8px;box-shadow:0 8px 32px ${THEME_VARS.shadow}`;
export const FIGURES_BACKDROP_STYLE = `position:fixed;inset:0;z-index:2147483645;background:${THEME_VARS.backdrop}`;
export const COMPARISON_BACKDROP_STYLE = `position:fixed;inset:0;z-index:2147483644;background:${THEME_VARS.backdrop}`;
export const COMPARISON_PANEL_STYLE = `position:fixed;inset:5%;z-index:2147483645;overflow:auto;padding:20px;background:${THEME_VARS.surface};color:${THEME_VARS.text};border:1px solid ${THEME_VARS.border};border-radius:8px;box-shadow:0 8px 40px #0006;font:menu`;
export const PREPARATION_BACKDROP_STYLE = `position:fixed;inset:0;z-index:2147483646;background:${THEME_VARS.backdrop};display:flex;align-items:center;justify-content:center`;
export const PREPARATION_PANEL_STYLE = `display:flex;flex-direction:column;gap:10px;padding:18px;width:min(880px,90vw);max-height:90vh;overflow:auto;background:${THEME_VARS.surface};color:${THEME_VARS.text};border:1px solid ${THEME_VARS.border};border-radius:8px;font:menu`;
export const SELECTION_ACTIONS_OVERLAY_STYLE = `position:fixed;right:16px;bottom:52px;z-index:100002;width:min(430px,calc(100vw - 32px));max-height:min(70vh,560px);overflow:auto;padding:10px;border:1px solid ${THEME_VARS.border};border-radius:8px;background:${THEME_VARS.surface};color:${THEME_VARS.text};box-shadow:0 12px 36px ${THEME_VARS.shadow};pointer-events:none;`;
export const REFERENCES_PANEL_STYLE = `position:fixed;z-index:2147483645;left:20px;top:50px;width:420px;max-width:calc(100vw - 24px);max-height:65vh;box-sizing:border-box;overflow:auto;overscroll-behavior:contain;padding:12px;background:${THEME_VARS.surface};color:${THEME_VARS.text};border:1px solid ${THEME_VARS.border};border-radius:6px;font:menu`;
export const PDF_HINT_BADGE_STYLE =
  'position:fixed;z-index:99999;background:#f9e2af;color:#1e1e2e;padding:1px 3px;border:1px solid #1e1e2e;border-radius:2px;font:bold 10px monospace;line-height:1.2;pointer-events:none;';
export const PDF_HINT_PROMPT_STYLE = `${PDF_HINT_BADGE_STYLE}top:4px;right:4px;padding:3px 6px;`;
export const PDF_FLASH_HINT_STYLE =
  'position:fixed;z-index:100000;background:#f9e2af;color:#1e1e2e;padding:1px 3px;border:1px solid #1e1e2e;border-radius:2px;font:bold 10px monospace;line-height:1.2;pointer-events:none;';
export const PDF_FLASH_INPUT_STYLE =
  'position:fixed;left:12px;bottom:46px;z-index:100001;width:min(360px,calc(100vw - 24px));box-sizing:border-box;padding:6px 8px;border:2px solid #8ab4ff;border-radius:5px;background:#0f172a;color:#ffffff;outline:none;font:13px/1.2 monospace;box-shadow:0 4px 14px rgba(0,0,0,.28);';
export const PDF_FLASH_PROMPT_STYLE =
  'position:fixed;left:12px;bottom:12px;z-index:100001;padding:5px 8px;border:2px solid #8ab4ff;border-radius:5px;background:#172554;color:#ffffff;font:bold 12px monospace;box-shadow:0 4px 14px rgba(0,0,0,.28);pointer-events:none;';
export const PDF_SELECTION_CURSOR_STYLE =
  'position:fixed;z-index:9998;pointer-events:none;outline:2px solid Highlight;outline-offset:1px;background:color-mix(in srgb,Highlight 16%,transparent);border-radius:2px;';
export const PDF_LINK_CUE_STYLE =
  'position:fixed;z-index:99998;background:#f57b7b;mix-blend-mode:multiply;pointer-events:none;';
