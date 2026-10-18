/// <reference types="vite/client" />

/** The site bundler compiles Vue SFCs; expose their component type to TypeScript. */
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent;
  export default component;
}
