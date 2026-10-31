/** HTTP capabilities shared by complete parsers; credentials belong only to the originating request. */
export interface DocumentHttpRequest {
  readonly url: string;
  readonly method?: 'GET' | 'POST' | 'PUT';
  readonly body?: Uint8Array | string;
  readonly contentType?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly signal: AbortSignal;
}

export interface DocumentServiceTransport {
  requestJSON(request: DocumentHttpRequest): Promise<unknown>;
  upload(request: DocumentHttpRequest): Promise<void>;
  download(request: DocumentHttpRequest): Promise<Uint8Array>;
  readArchive(bytes: Uint8Array, member: string, signal: AbortSignal): Promise<unknown>;
  wait(milliseconds: number, signal: AbortSignal): Promise<void>;
}
