import { createAddon, type ZoteroNeoController } from './addon';

type RuntimeGlobal = typeof globalThis & {
  ZoteroNeo?: ZoteroNeoController;
};

(globalThis as RuntimeGlobal).ZoteroNeo = createAddon();
