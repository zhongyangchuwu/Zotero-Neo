import { THEME_VARS } from '../../theme';

export const SETTINGS_BACKDROP_STYLE = `position:fixed;inset:0;z-index:99996;background:${THEME_VARS.backdrop}`;
export const SETTINGS_PANEL_STYLE = `position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(1100px,calc(100vw - 40px));height:min(860px,calc(100vh - 56px));box-sizing:border-box;z-index:99997;overflow:hidden;color:${THEME_VARS.text};background:${THEME_VARS.surface};border:1px solid ${THEME_VARS.border};border-radius:8px;box-shadow:0 12px 40px ${THEME_VARS.shadow};font:inherit;line-height:1.5;outline:none`;
export const PICKER_OVERLAY_STYLE = `position:fixed;inset:0;background:${THEME_VARS.backdrop};z-index:99999;display:flex;align-items:flex-start;justify-content:center;padding:5vh 3vw`;
export const PICKER_MODAL_STYLE = `background:${THEME_VARS.surface};color:${THEME_VARS.text};width:min(1280px,94vw);height:min(780px,86vh);border:1px solid ${THEME_VARS.border};border-radius:8px;overflow:hidden;box-shadow:0 20px 60px ${THEME_VARS.shadow};font:13px/1.45 system-ui,sans-serif`;
export const CENTERED_MONOSPACE_OVERLAY_STYLE = `position:fixed;inset:0;z-index:99998;display:flex;align-items:center;justify-content:center;padding:40px;background:${THEME_VARS.backdrop};color:${THEME_VARS.text};font:13px/1.4 monospace`;
export const LOCAL_FIND_OVERLAY_STYLE = `position:fixed;left:14px;right:14px;bottom:10px;z-index:100000;display:flex;align-items:center;gap:8px;max-width:760px;margin:0 auto;padding:7px 10px;background:${THEME_VARS.surface};color:${THEME_VARS.text};border:1px solid ${THEME_VARS.border};border-radius:5px;box-shadow:0 8px 28px ${THEME_VARS.shadow};font:13px/1.4 monospace`;
export const TAB_SIDEBAR_STYLE =
  'display:grid;grid-template-rows:auto auto minmax(0,1fr);min-width:0;height:100%;background:var(--zotero-neo-surface);color:var(--zotero-neo-text);font:menu;font-size:13px';
export const NOTE_CARET_CSS =
  'html.zv-note-normal-mode [contenteditable="true"],html.zv-note-normal-mode textarea,html.zv-note-normal-mode input{caret-color:rgb(96,150,255)!important}' +
  'html.zv-note-insert-mode [contenteditable="true"],html.zv-note-insert-mode textarea,html.zv-note-insert-mode input{caret-color:rgb(255,148,77)!important}';
