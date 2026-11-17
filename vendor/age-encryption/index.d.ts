export interface Stanza { readonly args: readonly string[]; readonly body: Uint8Array; }
export class Encrypter {
  setPassphrase(password: string): void;
  setScryptWorkFactor(logN: number): void;
  encrypt(file: Uint8Array | string): Promise<Uint8Array>;
}
export class Decrypter {
  addIdentity(identity: { unwrapFileKey(stanzas: readonly Stanza[]): Uint8Array | null | Promise<Uint8Array | null> }): void;
  addPassphrase(password: string): void;
  decrypt(file: Uint8Array): Promise<Uint8Array>;
}
export const armor: { encode(file: Uint8Array): string; decode(file: string): Uint8Array };
