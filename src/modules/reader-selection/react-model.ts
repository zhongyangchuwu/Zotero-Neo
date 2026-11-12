export interface SelectionActionsReactModel {
  stage: 'menu' | 'busy' | 'result';
  preview: string;
  actions: string[];
  selected: number;
  message: string;
  resultTitle: string;
  resultText: string;
}

// The Reader keyboard controller owns all actions.
export type SelectionActionsReactCommand = never;
