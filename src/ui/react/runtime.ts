// The native UI build binds this module's vendor import to the exact owner's
// preloaded library. Re-exporting retains React's real JSX/type namespace.
export { React, createRoot, flushSync } from '../../../vendor/react/index.js';
