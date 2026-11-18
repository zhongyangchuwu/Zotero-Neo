const GUIDE_URL = 'https://zhongyangchuwu.github.io/Zotero-Neo/docs/SETTINGS_GUIDE.html';

export function openSettingsHelp(topic: 'settings' | 'snapshots'): void {
  Zotero.launchURL(topic === 'snapshots' ? `${GUIDE_URL}#导出和恢复配置` : GUIDE_URL);
}
