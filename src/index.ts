import { createAddon, type ZoteroNeoController } from './addon';

type RuntimeGlobal = typeof globalThis & {
  ZoteroNeo?: Promise<ZoteroNeoController>;
};

(globalThis as RuntimeGlobal).ZoteroNeo = createAddon();
