import type { ReactNode } from 'react';
import { t } from '../../../i18n';
import { React } from '../runtime';
import { createReactView } from '../view';
import type { ReactView } from '../types';
import { THEME_VARS } from '../../theme';
import type { TabSidebarEntry, TabSidebarGroup } from '../../../modules/tab-enhancements/types';
import type {
  TabSidebarReactCommand,
  TabSidebarReactModel,
} from '../../../modules/tab-enhancements/react-model';

const COLORS = [
  '#e06c75',
  '#e5a84b',
  '#e5c463',
  '#73b87a',
  '#58a9b5',
  '#6d9ee8',
  '#a887d4',
  '#bd83a6',
];

type ActionButtonProps = {
  readonly action: string;
  readonly label: string;
  readonly groupID?: string | null;
  readonly entryID?: string;
  readonly color?: string;
  readonly title?: string;
  readonly part?: string;
  readonly disabled?: boolean;
  readonly current?: boolean;
  readonly hidden?: boolean;
  readonly expanded?: boolean;
  readonly className?: string;
  readonly children?: ReactNode;
};

function ActionButton({
  action,
  label,
  groupID,
  entryID,
  color,
  title,
  part,
  disabled,
  current,
  hidden,
  expanded,
  className,
  children,
}: ActionButtonProps) {
  return (
    <button
      type="button"
      className={className}
      data-action={action}
      data-neo-ui-part={part}
      data-group-id={groupID === undefined ? undefined : (groupID ?? '')}
      data-entry-id={entryID}
      data-color={color}
      aria-label={label}
      aria-current={current ? 'page' : undefined}
      aria-expanded={expanded}
      title={title}
      disabled={disabled}
      hidden={hidden}
    >
      {children ?? label}
    </button>
  );
}

function TabIcon({
  kind,
  color,
}: {
  readonly kind: 'folder' | 'folder-open' | 'document';
  readonly color: string;
}) {
  const path =
    kind === 'document'
      ? 'M6 3.5h8l4 4V20H6z M14 3.5v4h4'
      : kind === 'folder-open'
        ? 'M3 7V5h6l2 2h9v2 M3 9h18l-2.5 10h-14z'
        : 'M3 6h6l2 2h10v11H3z';
  return (
    <svg
      className="neo-tab-sidebar__icon"
      viewBox="0 0 24 24"
      width="19"
      height="19"
      aria-hidden="true"
      style={{ color }}
    >
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

export const TAB_SIDEBAR_REACT_CSS = `
[data-zv-tab-sidebar] #zotero-tabs-toolbar { display:flex !important; align-items:center; background:${THEME_VARS.surface} !important; color:${THEME_VARS.text} !important; }
[data-zv-tab-sidebar] #zotero-tabs-toolbar > .zotero-tb-button { color:${THEME_VARS.muted} !important; fill:currentColor !important; }
[data-zv-tab-sidebar] #zotero-tabs-toolbar > .zotero-tb-separator { width:1px; height:18px; flex:0 0 1px; }
.neo-tab-sidebar__header { grid-row:1; display:flex; align-items:center; gap:4px; padding:4px 6px; }
.neo-tab-sidebar__header > button { min-width:28px; min-height:28px; border:0; border-radius:7px; background:transparent; color:inherit; }
.neo-tab-sidebar__header > button:hover { background:${THEME_VARS.elevated}; }
.neo-tab-sidebar__body { grid-row:3; display:flex; flex:1; flex-direction:column; min-width:0; min-height:0; }
.neo-tab-sidebar__body[hidden] { display:none !important; }
.neo-tab-sidebar__query { min-width:0; margin:2px 6px 6px; padding:6px 9px; border:1px solid ${THEME_VARS.border}; border-radius:8px; background:${THEME_VARS.input}; color:${THEME_VARS.text}; }
.neo-tab-sidebar__query::placeholder { color:${THEME_VARS.muted} !important; opacity:1; }
.neo-tab-sidebar__list { flex:1; min-height:0; overflow:auto; padding:0 6px 6px; outline:none; }
.neo-tab-sidebar__group { border-inline-start:4px solid transparent; }
.neo-tab-sidebar__members { padding-inline-start:18px; }
.neo-tab-sidebar__row { display:flex; align-items:center; gap:5px; min-height:32px; margin:2px 0; padding:2px 6px; border-radius:8px; }
.neo-tab-sidebar__row[hidden] { display:none; }
.neo-tab-sidebar__row:hover { background:${THEME_VARS.elevated}; }
.neo-tab-sidebar__row:focus-visible { outline:2px solid ${THEME_VARS.focusRing}; outline-offset:-2px; }
.neo-tab-sidebar__row > button { appearance:none; border:0; background:transparent; color:inherit; font:inherit; }
.neo-tab-sidebar__row > button:focus-visible { outline:2px solid ${THEME_VARS.focusRing}; outline-offset:-2px; border-radius:6px; }
.neo-tab-sidebar__group-toggle { display:flex; flex:1; align-items:center; gap:7px; min-width:0; padding:3px 0; text-align:start; font-weight:600 !important; }
.neo-tab-sidebar__group-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.neo-tab-sidebar__group-count { flex:0 0 auto; color:${THEME_VARS.muted}; font-size:.82em; }
.neo-tab-sidebar__icon { flex:0 0 19px; }
.neo-tab-sidebar__entry-title { flex:1; min-width:0; padding:3px 0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:start; }
.neo-tab-sidebar__row [data-action='group-menu'],
.neo-tab-sidebar__row [data-action='entry-menu'] { flex:0 0 auto; padding:3px 5px; border-radius:6px; color:${THEME_VARS.muted}; cursor:pointer; }
.neo-tab-sidebar__row [data-action='group-menu']:hover,
.neo-tab-sidebar__row [data-action='entry-menu']:hover { background:${THEME_VARS.elevated}; color:${THEME_VARS.text}; }
.neo-tab-sidebar__badge { flex:0 0 auto; color:${THEME_VARS.muted}; font-size:.82em; }
.neo-tab-sidebar__editor { box-sizing:border-box; min-width:0; max-width:100%; padding:4px 6px; border:1px solid ${THEME_VARS.border}; border-radius:6px; background:${THEME_VARS.input}; color:${THEME_VARS.text}; font:inherit; }
.neo-tab-sidebar__group-row > .neo-tab-sidebar__editor { flex:1; }
.neo-tab-sidebar__list > .neo-tab-sidebar__editor { width:100%; margin-top:4px; }
.neo-tab-sidebar__menu { position:fixed; z-index:2147483647; display:flex; flex-direction:column; min-width:160px; max-height:70vh; overflow:auto; padding:4px; border:1px solid ${THEME_VARS.border}; border-radius:9px; background:${THEME_VARS.surface}; color:${THEME_VARS.text}; box-shadow:${THEME_VARS.shadow}; }
.neo-tab-sidebar__menu > button { border:0; border-radius:6px; padding:7px 10px; background:transparent; color:inherit; font:inherit; text-align:start; }
.neo-tab-sidebar__menu > button:hover,
.neo-tab-sidebar__menu > button:focus-visible { background:${THEME_VARS.selected}; color:${THEME_VARS.selectedText}; }
.neo-tab-sidebar__palette { display:flex; flex-wrap:wrap; gap:5px; max-width:220px; padding:6px 10px; }
.neo-tab-sidebar__color { width:20px; height:20px; padding:0 !important; border:1px solid ${THEME_VARS.border} !important; border-radius:50%; }
.neo-tab-sidebar__color { display:flex; align-items:center; justify-content:center; }
.neo-tab-sidebar__color-swatch { display:block; width:14px; height:14px; border-radius:50%; }
.neo-tab-sidebar__status { flex:0 0 auto; }
[data-zv-tab-top] .neo-tab-sidebar__header { flex:0 0 auto; padding:0 4px; }
[data-zv-tab-top] .neo-tab-sidebar__body { flex:1 1 auto; flex-direction:row; align-items:center; min-width:0; }
[data-zv-tab-top] .neo-tab-sidebar__query { flex:0 1 130px; width:100px; margin:2px 4px; padding:4px; }
[data-zv-tab-top] .neo-tab-sidebar__list { display:flex; flex:1 1 auto; align-items:center; overflow-x:auto; overflow-y:hidden; padding:0; scrollbar-width:thin; }
[data-zv-tab-top] .neo-tab-sidebar__group, [data-zv-tab-top] .neo-tab-sidebar__members { display:flex; flex:0 0 auto; align-items:center; padding:0; }
[data-zv-tab-top] .neo-tab-sidebar__group { border-inline-start:0; border-bottom:3px solid transparent; }
[data-zv-tab-top] [data-ungrouped] { min-width:16px; min-height:32px; }
[data-zv-tab-top] .neo-tab-sidebar__row { flex:0 0 auto; min-width:0; max-width:240px; margin:0 2px; }
[data-zv-tab-top] .neo-tab-sidebar__entry-row { width:180px; }
[data-zv-tab-top] .neo-tab-sidebar__group-row { max-width:180px; }
[data-zv-tab-top] .neo-tab-sidebar__status:not(:empty) { max-width:180px; margin:0; padding:4px; }
.neo-tab-sidebar__status:not(:empty) { margin:4px 6px; padding:8px; border:1px solid ${THEME_VARS.border}; border-radius:8px; background:${THEME_VARS.elevated}; }
`;

export function mountTabSidebarReactView(
  root: HTMLElement,
  initialModel: TabSidebarReactModel,
  _dispatch: (command: TabSidebarReactCommand) => void,
): ReactView<TabSidebarReactModel> {
  return createReactView(
    root,
    (model) => {
      const text = (key: string): string => t(`tabs.${key}`, model.language);
      const query = model.query.trim().toLocaleLowerCase();
      const matches = (value: string): boolean =>
        !query || value.toLocaleLowerCase().includes(query);
      const matchesEntry = (entry: TabSidebarEntry): boolean =>
        (model.top && entry.selected) || matches(entry.title) || matches(entry.searchText);
      const findEntry = (id: string): TabSidebarEntry | undefined => {
        if (model.view.library?.id === id) return model.view.library;
        for (const entry of model.view.ungrouped) if (entry.id === id) return entry;
        for (const group of model.view.groups)
          for (const entry of group.entries) if (entry.id === id) return entry;
        return undefined;
      };
      const editing = model.editing;
      const renderEditor = (key: string) => (
        <input
          key={key}
          className="neo-tab-sidebar__editor"
          type="text"
          data-neo-ui-part="editor"
          aria-label={text('groupName')}
          defaultValue={editing?.initialName ?? ''}
        />
      );
      const renderEntry = (entry: TabSidebarEntry, groupID: string | null, hidden = false) => (
        <div
          key={entry.id}
          className={`neo-tab-sidebar__row neo-tab-sidebar__entry-row${entry.selected ? ' is-selected' : ''}`}
          data-neo-tab-row="entry"
          data-group-id={groupID ?? ''}
          data-entry-id={entry.id}
          tabIndex={0}
          draggable={entry.kind !== 'library' && entry.kind !== 'other'}
          hidden={hidden}
          style={{
            background: entry.selected ? THEME_VARS.selected : undefined,
            color: entry.selected ? THEME_VARS.selectedText : THEME_VARS.text,
          }}
        >
          <TabIcon
            kind={entry.kind === 'library' ? 'folder' : 'document'}
            color={THEME_VARS.muted}
          />
          <ActionButton
            action="activate"
            label={entry.title}
            entryID={entry.id}
            className="neo-tab-sidebar__entry-title"
            title={entry.nativeTitle}
            current={entry.selected}
          >
            {entry.title}
          </ActionButton>
          {model.top && entry.status === 'open' && entry.audioStatus?.active && (
            <ActionButton
              action="toggle-audio"
              entryID={entry.id}
              label={text(entry.audioStatus.paused ? 'playAudio' : 'pauseAudio')}
            >
              {entry.audioStatus.paused ? '▶' : 'Ⅱ'}
            </ActionButton>
          )}
          {model.top && entry.status === 'open' && entry.kind !== 'library' && (
            <ActionButton action="close" entryID={entry.id} label={text('close')}>
              ×
            </ActionButton>
          )}
          {entry.status === 'other-window' && (
            <span className="neo-tab-sidebar__badge" data-neo-tab-badge="1">
              {text('otherWindow')}
            </span>
          )}
          {entry.kind !== 'library' && entry.kind !== 'other' && (
            <ActionButton
              action="entry-menu"
              label={text('entryActions')}
              groupID={groupID}
              entryID={entry.id}
              title={text('entryActions')}
              className="neo-tab-sidebar__menu-trigger"
            >
              ⋯
            </ActionButton>
          )}
        </div>
      );
      const renderGroup = (group: TabSidebarGroup) => {
        const groupMatches = !query || matches(group.name);
        const matchingEntries = group.entries.filter(matchesEntry);
        if (query && !groupMatches && !matchingEntries.length) return null;
        const visibleEntries = groupMatches ? group.entries : matchingEntries;
        const groupLabel = `${text(group.collapsed ? 'expandGroup' : 'collapseGroup')}: ${group.name} (${group.entries.length})`;
        return (
          <section
            key={group.id}
            className="neo-tab-sidebar__group"
            data-drop-group={group.id}
            style={{ borderColor: group.color || THEME_VARS.accent }}
          >
            <div
              className="neo-tab-sidebar__row neo-tab-sidebar__group-row"
              data-neo-tab-row="group"
              data-group-id={group.id}
              tabIndex={0}
              draggable
            >
              <ActionButton
                action="toggle-group"
                label={groupLabel}
                groupID={group.id}
                className="neo-tab-sidebar__group-toggle"
                expanded={!group.collapsed}
              >
                <span aria-hidden="true">{group.collapsed ? '▸' : '▾'}</span>
                <TabIcon
                  kind={group.collapsed ? 'folder' : 'folder-open'}
                  color={group.color || THEME_VARS.accent}
                />
                <span className="neo-tab-sidebar__group-name">{group.name}</span>
                <span className="neo-tab-sidebar__group-count">{group.entries.length}</span>
              </ActionButton>
              <ActionButton
                action="group-menu"
                label={text('groupActions')}
                groupID={group.id}
                title={text('groupActions')}
                className="neo-tab-sidebar__menu-trigger"
              >
                ⋯
              </ActionButton>
              {editing?.groupID === group.id && renderEditor(`group:${group.id}`)}
            </div>
            <div className="neo-tab-sidebar__members">
              {visibleEntries.map((entry) =>
                renderEntry(entry, group.id, !query && group.collapsed && !entry.selected),
              )}
            </div>
          </section>
        );
      };
      const menu = model.menu;
      const menuGroup =
        menu?.kind === 'group'
          ? model.view.groups.find((group) => group.id === menu.groupID)
          : undefined;
      const menuEntry =
        menu?.kind === 'entry' && menu.entryID ? findEntry(menu.entryID) : undefined;
      const menuEntryCanManage =
        menuEntry !== undefined && menuEntry.kind !== 'library' && menuEntry.kind !== 'other';
      const listLabel = text('title');

      return (
        <>
          <header
            className="neo-tab-sidebar__header"
            data-neo-ui-part="header"
            aria-label={listLabel}
          >
            <ActionButton
              action="toggle-sidebar"
              part="toggle"
              label={text(
                model.top
                  ? model.collapsed
                    ? 'showGroups'
                    : 'showNativeTabs'
                  : model.collapsed
                    ? 'expand'
                    : 'collapse',
              )}
              title={text(
                model.top
                  ? model.collapsed
                    ? 'showGroups'
                    : 'showNativeTabs'
                  : model.collapsed
                    ? 'expand'
                    : 'collapse',
              )}
            >
              {model.collapsed ? '≡' : '−'}
            </ActionButton>
            <ActionButton
              action="new-group"
              label={text('newGroup')}
              title={text('newGroup')}
              hidden={model.collapsed}
            >
              +
            </ActionButton>
            {model.top && !model.collapsed && (
              <>
                <ActionButton action="scroll-back" label={text('scrollBack')}>
                  ‹
                </ActionButton>
                <ActionButton action="scroll-forward" label={text('scrollForward')}>
                  ›
                </ActionButton>
              </>
            )}
          </header>
          <div className="neo-tab-sidebar__body" data-neo-ui-part="body" hidden={model.collapsed}>
            <input
              className="neo-tab-sidebar__query"
              type="search"
              data-neo-ui-part="query"
              aria-label={text('search')}
              placeholder={text('search')}
              defaultValue={model.query}
            />
            <div
              className="neo-tab-sidebar__list"
              data-neo-ui-part="list"
              aria-label={listLabel}
              tabIndex={0}
            >
              {model.view.library &&
                matchesEntry(model.view.library) &&
                renderEntry(model.view.library, null)}
              {model.view.groups.map(renderGroup)}
              <div
                className="neo-tab-sidebar__members"
                data-ungrouped="1"
                data-drop-group=""
                aria-label={text('ungrouped')}
              >
                {model.view.ungrouped.filter(matchesEntry).map((entry) => renderEntry(entry, null))}
              </div>
              {editing?.groupID === null && renderEditor(`new:${editing.memberID ?? ''}`)}
            </div>
            <div
              className="neo-tab-sidebar__status"
              role="status"
              aria-live="polite"
              hidden={!model.status}
            >
              {model.status}
            </div>
            {menu && (
              <div
                className="neo-tab-sidebar__menu"
                data-neo-ui-part="menu"
                data-group-id={menu.groupID ?? ''}
                data-entry-id={menu.entryID ?? ''}
                role="group"
                aria-label={text(
                  menu.kind === 'group'
                    ? 'groupActions'
                    : menu.kind === 'entry'
                      ? 'entryActions'
                      : 'title',
                )}
                style={{ left: `${menu.x}px`, top: `${menu.y}px` }}
              >
                {menu.kind === 'blank' && (
                  <ActionButton action="new-group" label={text('newGroup')}>
                    {text('newGroup')}
                  </ActionButton>
                )}
                {menu.kind === 'group' && menuGroup && (
                  <>
                    <ActionButton action="new-group" label={text('newGroup')}>
                      {text('newGroup')}
                    </ActionButton>
                    <ActionButton action="rename" label={text('rename')} groupID={menuGroup.id}>
                      {text('rename')}
                    </ActionButton>
                    <div className="neo-tab-sidebar__palette" aria-label={text('color')}>
                      {COLORS.map((color) => (
                        <ActionButton
                          key={color}
                          action="color"
                          label={`${text('color')} ${color}`}
                          title={`${text('color')} ${color}`}
                          groupID={menuGroup.id}
                          color={color}
                          className="neo-tab-sidebar__color"
                        >
                          <span
                            className="neo-tab-sidebar__color-swatch"
                            style={{ backgroundColor: color }}
                          />
                        </ActionButton>
                      ))}
                    </div>
                    <ActionButton
                      action="close-group"
                      label={text('closeGroup')}
                      groupID={menuGroup.id}
                    >
                      {text('closeGroup')}
                    </ActionButton>
                    <ActionButton action="ungroup" label={text('ungroup')} groupID={menuGroup.id}>
                      {text('ungroup')}
                    </ActionButton>
                  </>
                )}
                {menu.kind === 'entry' && menuEntry && menuEntryCanManage && (
                  <>
                    {menuEntry.status === 'open' && (
                      <ActionButton
                        action="close"
                        label={text('close')}
                        groupID={menu.groupID}
                        entryID={menuEntry.id}
                      >
                        {text('close')}
                      </ActionButton>
                    )}
                    {menu.groupID && (
                      <ActionButton
                        action="remove"
                        label={text('remove')}
                        groupID={menu.groupID}
                        entryID={menuEntry.id}
                      >
                        {text('remove')}
                      </ActionButton>
                    )}
                    <ActionButton
                      action="new-group-for-entry"
                      label={text('newGroup')}
                      groupID={menu.groupID}
                      entryID={menuEntry.id}
                    >
                      {text('newGroup')}
                    </ActionButton>
                    {model.view.groups
                      .filter((group) => group.id !== menu.groupID)
                      .map((group) => (
                        <ActionButton
                          key={group.id}
                          action="move-member"
                          label={`${text('moveTo')}: ${group.name}`}
                          title={`${text('moveTo')}: ${group.name}`}
                          groupID={group.id}
                          entryID={menuEntry.id}
                        >
                          {text('moveTo')}: {group.name}
                        </ActionButton>
                      ))}
                  </>
                )}
              </div>
            )}
          </div>
        </>
      );
    },
    initialModel,
  );
}
