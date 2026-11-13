import { React, createRoot, flushSync } from '../../../vendor/react/index.js';
import type { NativeReactLibrary } from './types';

const library: NativeReactLibrary = { React, createRoot, flushSync };
globalThis.NeoReactRuntime = library;
