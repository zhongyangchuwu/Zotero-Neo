export function zipDirectory(sourceDirectory: string, outputFile: string): void;
export function listZipMembers(archive: string): string[];
export function readZipMember(archive: string, member: string): Buffer;
