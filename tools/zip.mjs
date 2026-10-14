import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

const CRC_TABLE = new Uint32Array(256);
for (let index = 0; index < CRC_TABLE.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  CRC_TABLE[index] = value >>> 0;
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function filesUnder(root) {
  const files = [];
  const visit = (directory) => {
    const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    );
    for (const entry of entries) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  };
  visit(root);
  return files;
}

export function zipDirectory(sourceDirectory, outputFile) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const absolute of filesUnder(sourceDirectory)) {
    if (!statSync(absolute).isFile()) continue;
    const name = relative(sourceDirectory, absolute).split(sep).join('/');
    if (name.includes('\\')) throw new Error(`Invalid ZIP member path: ${name}`);

    const nameBytes = Buffer.from(name, 'utf8');
    const data = readFileSync(absolute);
    const compressed = deflateRawSync(data, { level: 9 });
    const checksum = crc32(data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(33, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, nameBytes, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(0x0314, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(33, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(centralHeader, nameBytes);

    localOffset += localHeader.length + nameBytes.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  const fileCount = centralParts.length / 2;
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(fileCount, 8);
  end.writeUInt16LE(fileCount, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  end.writeUInt16LE(0, 20);

  writeFileSync(outputFile, Buffer.concat([...localParts, centralDirectory, end]));
}

function readZipEntries(archive) {
  const data = readFileSync(archive);
  let endOffset = data.length - 22;
  while (endOffset >= 0 && data.readUInt32LE(endOffset) !== 0x06054b50) endOffset -= 1;
  if (endOffset < 0) throw new Error(`ZIP end record not found: ${archive}`);

  const fileCount = data.readUInt16LE(endOffset + 10);
  let offset = data.readUInt32LE(endOffset + 16);
  const entries = [];
  for (let index = 0; index < fileCount; index += 1) {
    if (data.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`Invalid central directory entry at ${offset}`);
    }
    const nameLength = data.readUInt16LE(offset + 28);
    const extraLength = data.readUInt16LE(offset + 30);
    const commentLength = data.readUInt16LE(offset + 32);
    entries.push({
      name: data.subarray(offset + 46, offset + 46 + nameLength).toString('utf8'),
      flags: data.readUInt16LE(offset + 8),
      compressionMethod: data.readUInt16LE(offset + 10),
      checksum: data.readUInt32LE(offset + 16),
      compressedSize: data.readUInt32LE(offset + 20),
      uncompressedSize: data.readUInt32LE(offset + 24),
      localOffset: data.readUInt32LE(offset + 42),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return { data, entries };
}

export function listZipMembers(archive) {
  return readZipEntries(archive).entries.map(({ name }) => name);
}

export function readZipMember(archive, member) {
  const { data, entries } = readZipEntries(archive);
  const entry = entries.find(({ name }) => name === member);
  if (!entry) throw new Error(`ZIP member not found: ${member}`);
  if (entry.flags & 1) throw new Error(`Encrypted ZIP member is unsupported: ${member}`);

  const { localOffset } = entry;
  if (localOffset + 30 > data.length) {
    throw new Error(`Truncated local ZIP header for member: ${member}`);
  }
  if (data.readUInt32LE(localOffset) !== 0x04034b50) {
    throw new Error(`Invalid local ZIP header for member: ${member}`);
  }
  const localFlags = data.readUInt16LE(localOffset + 6);
  const localCompressionMethod = data.readUInt16LE(localOffset + 8);
  if (localFlags & 1) throw new Error(`Encrypted ZIP member is unsupported: ${member}`);
  if (localCompressionMethod !== entry.compressionMethod) {
    throw new Error(`Mismatched ZIP compression method for member: ${member}`);
  }

  const localNameLength = data.readUInt16LE(localOffset + 26);
  const localExtraLength = data.readUInt16LE(localOffset + 28);
  const localName = data
    .subarray(localOffset + 30, localOffset + 30 + localNameLength)
    .toString('utf8');
  if (localName !== member) throw new Error(`Mismatched local ZIP member name: ${member}`);
  const payloadOffset = localOffset + 30 + localNameLength + localExtraLength;
  const payloadEnd = payloadOffset + entry.compressedSize;
  if (payloadEnd > data.length) throw new Error(`Truncated ZIP member: ${member}`);

  const compressed = data.subarray(payloadOffset, payloadEnd);
  let payload;
  if (entry.compressionMethod === 0) payload = compressed;
  else if (entry.compressionMethod === 8) {
    try {
      payload = inflateRawSync(compressed);
    } catch (error) {
      throw new Error(`Unable to decompress ZIP member: ${member}`, { cause: error });
    }
  } else throw new Error(`Unsupported ZIP compression method for member: ${member}`);

  if (payload.length !== entry.uncompressedSize || crc32(payload) !== entry.checksum) {
    throw new Error(`Invalid ZIP payload for member: ${member}`);
  }
  return payload;
}
