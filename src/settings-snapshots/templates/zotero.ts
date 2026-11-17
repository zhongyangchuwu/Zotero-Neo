import type { SettingsValue } from '../contracts';
import { fields, type TransferField } from '../adapters/fields';

const NATIVE_BOOLEAN = `automaticScraperUpdates triggerProxyAuthentication automaticSnapshots downloadAssociatedFiles reportTranslationFailure automaticTags hideContextAnnotationRows recursiveCollections autoRecognizeFiles autoRenameFiles autoRenameFiles.linked autoRenameFiles.onMetadataChange showAttachmentFilenames capitalizeTitles launchNonNativeFiles naturalSorting sortNotesChronologically sortNotesChronologically.reader sortAttachmentsChronologically showTrashWhenEmpty viewOnDoubleClick groups.copyChildLinks groups.copyChildFileAttachments groups.copyAnnotations groups.copyChildNotes groups.copyTags feeds.sortAscending sortCreatorAsString tagSelector.showAutomatic tagSelector.displayAllTags search.useLeftBound note.smartQuotes report.includeAllChildItems report.combineChildItems export.displayCharsetOption export.citePaperJournalArticleURL cite.automaticJournalAbbreviations import.createNewCollection.fromFileOpenHandler integration.useClassicAddCitationDialog integration.keepAddCitationDialogRaised integration.citationDialogShowLocatorTip integration.annotationDialogIncludeComments integration.citationPreviewShown httpServer.enabled httpServer.localAPI.enabled zeroconf.server.enabled streaming.enabled sync.autoSync sync.server.compressData sync.storage.enabled sync.storage.groups.enabled sync.fulltext.enabled proxies.autoRecognize proxies.transparent proxies.disableByDomain proxies.showRedirectNotification showAttachmentPreview openReaderInNewWindow openNoteInNewWindow translators.attachSupplementary translators.supplementaryAsLink translators.RIS.import.ignoreUnknown translators.RIS.import.keepID retractions.enabled reader.ebookHyphenate reader.autoDisableTool.note reader.autoDisableTool.text reader.autoDisableTool.image`;
const NATIVE_NUMBER = `undoHistory.steps trashAutoEmptyDays feeds.defaultTTL feeds.defaultCleanupReadAfter feeds.defaultCleanupUnreadAfter backup.numBackups backup.interval fulltext.textMaxLength fulltext.pdfMaxPages export.quickCopy.dragLimit integration.port integration.autoRegenerate httpServer.port sync.storage.maxDownloads sync.storage.maxUploads sync.storage.deleteDelayDays`;
const NATIVE_STRING = `proxyAuthenticationURLs openURL.resolver autoRenameFiles.fileTypes fontSize layout fallbackSort uiDensity itemPaneHeader itemPaneHeader.bibEntry.style itemPaneHeader.bibEntry.locale search.quicksearch-mode note.fontFamily note.fontSize note.tabFontSize export.lastTranslator export.translatorSettings export.lastNoteTranslator export.noteTranslatorSettings export.lastStyle export.lastLocale export.bibliographySettings export.quickCopy.setting export.quickCopy.locale export.noteQuickCopy.setting integration.citationDialogMode sync.storage.protocol sync.storage.scheme sync.storage.url sync.storage.username sync.storage.downloadMode.personal sync.storage.downloadMode.groups proxies.disableByDomainString tabs.title.reader reader.textSelectionAnnotationMode reader.lightTheme reader.darkTheme reader.ebookFontFamily reader.readAloud.highlightGranularity`;
export const NATIVE_PREFERENCE_FIELDS: readonly TransferField[] = [
  ...fields('boolean', 'Native options', NATIVE_BOOLEAN),
  ...fields('number', 'Native options', NATIVE_NUMBER),
  ...fields('string', 'Native options', NATIVE_STRING),
  ...fields('number', 'Native options', 'browserRequest.onLoadTimeout browserRequest.timeout').map(
    (field) => ({
      ...field,
      validate: (value: SettingsValue) => typeof value === 'number' && value >= 0,
    }),
  ),
  {
    key: 'pref:browser.theme.toolbar-theme',
    label: 'Native color scheme',
    category: 'Native appearance',
    type: 'number',
    validate: (value) => value === 0 || value === 1 || value === 2,
  },
  {
    key: 'pref:intl.locale.requested',
    label: 'Native language',
    category: 'Native appearance',
    type: 'string',
    restart: true,
    last: true,
  },
  {
    key: 'pref:bidi.browser.ui',
    label: 'Bidirectional interface',
    category: 'Native appearance',
    type: 'boolean',
    restart: true,
    last: true,
  },
  { key: 'openURL.name', label: 'Library resolver name', category: 'Locate', type: 'string' },
  {
    key: 'newLibraryTabTarget',
    label: 'New library tab target',
    category: 'Device library references',
    type: 'string',
    manual:
      'Choose a library or collection on the target device; saved native tree identities are not rewritten',
  },
  ...fields(
    'string',
    'Templates / CSS (manual)',
    'note.css annotations.noteTemplates.title annotations.noteTemplates.highlight annotations.noteTemplates.note findPDFs.resolvers',
  ).map((field) => ({
    ...field,
    manual: 'Code-bearing CSS, templates, and custom resolvers are not automatically restored',
  })),
  ...fields(
    'string',
    'Device resources',
    'fileHandler.pdf fileHandler.epub fileHandler.snapshot',
  ).map((field) => ({ ...field, path: 'file' as const, restart: true })),
  {
    key: 'baseAttachmentPath',
    label: 'Linked attachment base directory',
    type: 'string',
    category: 'Device resources',
    manual:
      'Use Zotero Advanced → Files and Folders to map existing linked attachments; this transfer never rewrites attachment identities',
    path: 'directory',
  },
  {
    key: 'saveRelativeAttachmentPath',
    label: 'Relative linked attachment paths',
    type: 'boolean',
    category: 'Device resources',
    manual:
      'Configure together with the linked attachment base directory in native Zotero settings',
  },
  ...fields(
    'string',
    'Blocked device configuration',
    'dataDir lastDataDir fallbackLauncher.unix fallbackLauncher.windows',
  ).map((field) => ({
    ...field,
    manual: 'Data-directory migration and executable launchers require manual configuration',
  })),
  {
    key: 'useDataDir',
    label: 'Custom data directory',
    type: 'boolean',
    category: 'Blocked device configuration',
    manual: 'Data-directory migration requires manual configuration',
  },
];
