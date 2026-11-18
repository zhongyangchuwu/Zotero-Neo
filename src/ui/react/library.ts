import { React, ReactDOM, JSXRuntime, createRoot, flushSync } from '../../../vendor/react/index.js';
import type { NativeReactLibrary } from './types';

const library: NativeReactLibrary = { React, ReactDOM, JSXRuntime, createRoot, flushSync };
globalThis.NeoReactRuntime = library;
