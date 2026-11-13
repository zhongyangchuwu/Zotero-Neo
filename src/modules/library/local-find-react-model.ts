/** Presentation data passed to the native React compartment. */
export interface LocalFindReactModel {
  placeholder: string;
}

// The native controller owns keyboard, IME, focus, and navigation.
export type LocalFindReactCommand = never;
