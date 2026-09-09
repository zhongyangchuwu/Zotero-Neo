interface nsIXPCComponents_Classes {
  readonly '@mozilla.org/network/file-output-stream;1': nsIJSCID;
  readonly '@mozilla.org/widget/clipboardhelper;1': nsIJSCID;
}

type SelectionModifyAlteration = 'move' | 'extend';
type SelectionModifyDirection = 'forward' | 'backward' | 'left' | 'right';
type SelectionModifyGranularity =
  | 'character'
  | 'word'
  | 'line'
  | 'lineboundary'
  | 'paragraph'
  | 'sentence';

interface Selection {
  modify(
    alter: SelectionModifyAlteration,
    direction: SelectionModifyDirection,
    granularity: SelectionModifyGranularity,
  ): void;
}
