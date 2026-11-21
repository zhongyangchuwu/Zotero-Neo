// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { PickerReactModel } from '../../src/main/picker/react-model';
import { mountPickerReactView } from '../../src/ui/react/surfaces/picker';
import type { ReactView } from '../../src/ui/react/types';

const model: PickerReactModel = {
  title: 'Find items',
  placeholder: 'Search',
  sourceLabel: null,
  sourceDisabled: false,
  count: '2/2',
  rows: [
    {
      text: 'Plain result',
      boundary: false,
    },
    {
      text: 'Reading notes',
      boundary: true,
      cells: {
        title: 'Reading notes',
        matches: [0, 1, 2],
        icon: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        author: 'Ada',
        year: '2026',
        detail: 'Journal article',
        citekey: 'ada2026',
      },
    },
  ],
  selected: 1,
  panes: 2,
  multiSelect: false,
  marked: [],
  empty: 'No matches',
  loading: false,
  previewTitle: 'Reading notes',
  previewBody: 'An item preview',
  shortcutHelp: 'Enter: Open',
  status: '',
  focusPane: 'list',
  mouseEnabled: true,
};

let view: ReactView<PickerReactModel> | undefined;

afterEach(() => {
  view?.dispose();
  view = undefined;
  document.body.replaceChildren();
});

function mount(initialModel: PickerReactModel) {
  const root = document.createElement('div');
  document.body.append(root);
  view = mountPickerReactView(root, initialModel, () => {});
  return view;
}

describe('shared picker React presentation', () => {
  it('preserves direct plain and bibliographic rows and the two-pane preview', () => {
    const picker = mount(model);
    const results = picker.getElement('results')!;
    const plain = results.children[0]!;
    const bibliography = results.children[1]!;

    expect(plain.querySelector('.picker-row-text')?.getAttribute('title')).toBe('Plain result');
    expect(plain.getAttribute('data-zv-picker-row')).toBe('1');
    expect(plain.getAttribute('data-zv-picker-index')).toBe('0');
    expect(bibliography.matches('.picker-row.picker-row-bibliographic.boundary[selected]')).toBe(
      true,
    );
    expect(bibliography.getAttribute('aria-selected')).toBe('true');
    expect(results.getAttribute('aria-activedescendant')).toBe(bibliography.id);
    expect(bibliography.querySelector('.picker-item-icon')?.tagName).toBe('IMG');
    expect(bibliography.querySelector('.picker-cell-title-text .picker-match')?.textContent).toBe(
      'Rea',
    );
    expect(bibliography.querySelector('.picker-cell-meta .picker-cell-author')?.textContent).toBe(
      'Ada',
    );
    expect(bibliography.querySelector('.picker-cell-year')?.textContent).toBe('2026');
    expect(bibliography.querySelector('.picker-cell-detail')?.textContent).toBe('Journal article');
    expect(bibliography.querySelector('.picker-cell-citekey')?.textContent).toBe('@ada2026');
    expect(results.hasAttribute('aria-multiselectable')).toBe(false);
    expect(results.querySelector('.picker-check')).toBeNull();
    expect(picker.getElement('preview-title')?.textContent).toBe('Reading notes');
    expect(picker.getElement('preview')?.textContent).toContain('An item preview');

    picker.update({ ...model, panes: 1 });
    expect(picker.getElement('preview')).toBeNull();
    expect(picker.getElement('preview-title')).toBeNull();
    expect(picker.getElement('results')).toBe(results);
  });

  it('renders structured columns and keeps marked selection separate from the active row', () => {
    const compact: PickerReactModel = {
      ...model,
      panes: 1,
      multiSelect: true,
      marked: [0],
      selected: 1,
      rows: [
        {
          text: 'Project 😀',
          boundary: false,
          icon: 'folder',
          columns: [
            { text: 'Project 😀', role: 'primary', weight: 4, matches: [9] },
            { text: 'Library / Work', role: 'muted', align: 'start', weight: 2 },
            { text: 'ZK123', role: 'mono' },
            { text: '12', role: 'badge', align: 'end' },
          ],
        },
        {
          text: 'Create collection',
          boundary: false,
          icon: 'plus',
          kind: 'action',
          selectable: false,
        },
        { text: 'Another collection', boundary: false },
      ],
    };
    const picker = mount(compact);
    const results = picker.getElement('results')!;
    const collection = results.children[0]!;
    const create = results.children[1]!;
    const unmarked = results.children[2]!;
    const columns = collection.querySelectorAll<HTMLElement>('.picker-column');

    expect(picker.getElement('preview')).toBeNull();
    expect(Array.from(columns, (column) => column?.textContent)).toEqual([
      'Project 😀',
      'Library / Work',
      'ZK123',
      '12',
    ]);
    expect(columns[0]?.title).toBe('Project 😀');
    expect(columns[0]?.dataset.columnRole).toBe('primary');
    expect(columns[0]?.style.flexGrow).toBe('4');
    expect(columns[0]?.querySelector('.picker-match')?.textContent).toBe('😀');
    expect(columns[1]?.dataset.columnRole).toBe('muted');
    expect(columns[2]?.dataset.columnRole).toBe('mono');
    expect(columns[3]?.dataset.columnAlign).toBe('end');
    expect(columns[3]?.querySelector('.picker-column-badge')?.textContent).toBe('12');
    expect(collection.querySelector('svg[data-picker-icon="folder"]')).not.toBeNull();
    expect(create.querySelector('svg[data-picker-icon="plus"]')).not.toBeNull();

    expect(results.getAttribute('aria-multiselectable')).toBe('true');
    expect(results.getAttribute('aria-activedescendant')).toBe(create.id);
    expect(collection.matches('.picker-row[data-row-kind="item"][data-marked="true"]')).toBe(true);
    expect(collection.hasAttribute('selected')).toBe(false);
    expect(collection.getAttribute('aria-selected')).toBe('true');
    expect(collection.querySelector('.picker-check')).not.toBeNull();
    expect(create.matches('.picker-row[data-row-kind="action"][selected]')).toBe(true);
    expect(create.hasAttribute('aria-selected')).toBe(false);
    expect(create.querySelector('.picker-check')).toBeNull();
    expect(unmarked.getAttribute('aria-selected')).toBe('false');
    expect(unmarked.querySelector('.picker-check')).not.toBeNull();

    picker.update({ ...compact, selected: 2, marked: [2], mouseEnabled: false });
    expect(results.getAttribute('aria-activedescendant')).toBe(unmarked.id);
    expect(unmarked.matches('[selected][data-marked="true"]')).toBe(true);
    expect(unmarked.hasAttribute('data-picker-clickable')).toBe(false);
    expect(unmarked.querySelector('.picker-check')).not.toBeNull();
    expect(collection.hasAttribute('data-marked')).toBe(false);
  });
});
