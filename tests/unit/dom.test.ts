import { describe, expect, it } from 'vitest';

import { asElement, asKeyboardEvent, isEditableElement } from '../../src/platform/dom';

describe('cross-compartment DOM guards', () => {
  it('recognizes keyboard events without a global KeyboardEvent constructor', () => {
    const event = { key: 'j', type: 'keydown' } as unknown as Event;

    expect(asKeyboardEvent(event)).toBe(event);
    expect(asKeyboardEvent({ type: 'blur' } as Event)).toBeNull();
  });

  it('recognizes editable wrapped elements without DOM constructor checks', () => {
    const input = { tagName: 'INPUT', localName: 'input', shadowRoot: null } as unknown as Element;
    const editor = {
      tagName: 'DIV',
      localName: 'div',
      isContentEditable: true,
      shadowRoot: null,
    } as unknown as Element;

    expect(asElement(input)).toBe(input);
    expect(isEditableElement(input)).toBe(true);
    expect(isEditableElement(editor)).toBe(true);
    expect(asElement({ type: 'keydown' } as unknown as EventTarget)).toBeNull();
  });
});
