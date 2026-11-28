import { THEME_VARS } from '../../theme';

export const SETTINGS_BACKDROP_STYLE = `position:fixed;inset:0;z-index:99996;background:${THEME_VARS.backdrop}`;
export const SETTINGS_PANEL_STYLE = `position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(1100px,calc(100vw - 40px));height:min(860px,calc(100vh - 56px));box-sizing:border-box;z-index:99997;overflow:hidden;color:${THEME_VARS.text};background:${THEME_VARS.surface};border:1px solid ${THEME_VARS.border};border-radius:var(--neo-radius);box-shadow:var(--neo-shadow);line-height:1.5;outline:none`;
export const PICKER_OVERLAY_STYLE = `position:fixed;inset:0;background:${THEME_VARS.backdrop};z-index:99999;display:flex;align-items:flex-start;justify-content:center;padding:5vh 3vw`;
export const CENTERED_MONOSPACE_OVERLAY_STYLE = `position:fixed;inset:0;z-index:99998;display:flex;align-items:center;justify-content:center;padding:40px;background:${THEME_VARS.backdrop};color:${THEME_VARS.text};font:13px/1.4 monospace`;
export const LOCAL_FIND_OVERLAY_STYLE = `position:fixed;left:14px;right:14px;bottom:10px;z-index:100000;display:flex;align-items:center;gap:8px;max-width:760px;margin:0 auto;padding:7px 10px;background:${THEME_VARS.surface};color:${THEME_VARS.text};border:1px solid ${THEME_VARS.border};border-radius:var(--neo-radius);box-shadow:var(--neo-shadow);font:13px/1.4 var(--neo-font-mono)`;
