/**
 * Magic-byte (file signature) validation — do not trust client Content-Type alone.
 */

import fs from 'node:fs';

type Signature = { mime: string; bytes: number[]; offset?: number; more?: number[] };

const SIGNATURES: Signature[] = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46], more: [0x57, 0x45, 0x42, 0x50] }, // RIFF....WEBP
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { mime: 'video/mp4', bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 }, // ....ftyp (also audio/mp4, audio/m4a)
  { mime: 'audio/webm', bytes: [0x1a, 0x45, 0xdf, 0xa3] }, // EBML
  { mime: 'audio/ogg', bytes: [0x4f, 0x67, 0x67, 0x53] }, // OggS
  { mime: 'audio/wav', bytes: [0x52, 0x49, 0x46, 0x46], more: [0x57, 0x41, 0x56, 0x45] }, // RIFF....WAVE
];

/** Claimed MIME types that share a container signature with the detected MIME. */
const MIME_ALIASES: Record<string, string[]> = {
  'video/mp4': ['audio/mp4', 'audio/m4a', 'audio/x-m4a'],
  'audio/webm': ['video/webm', 'audio/webm'],
  'audio/ogg': ['application/ogg', 'audio/ogg', 'audio/opus'],
  'audio/wav': ['audio/wave', 'audio/x-wav', 'audio/wav'],
};

function mimeCompatible(claimed: string, detected: string): boolean {
  if (claimed === detected) return true
  const aliases = MIME_ALIASES[detected] || []
  return aliases.includes(claimed)
}

function matchesAt(buf: Buffer, signature: number[], offset: number): boolean {
  if (buf.length < offset + signature.length) return false
  for (let i = 0; i < signature.length; i += 1) {
    if (buf[offset + i] !== signature[i]) return false
  }
  return true
}

export function detectMimeFromBuffer(buf: Buffer): string | null {
  // SVG is text-based — look for XML/SVG markers in the first bytes.
  const head = buf.toString('utf8', 0, Math.min(buf.length, 256)).trimStart();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && /<svg[\s>]/i.test(head))) {
    return 'image/svg+xml';
  }

  for (const sig of SIGNATURES) {
    const offset = sig.offset ?? 0;
    if (!matchesAt(buf, sig.bytes, offset)) continue;
    if (sig.more) {
      // WEBP/WAVE brand typically at offset 8
      if (!matchesAt(buf, sig.more, 8)) continue;
    }
    return sig.mime;
  }
  return null;
}

export function assertFileMagic(filePath: string, claimedMime: string): { ok: true } | { ok: false; reason: string } {
  let fd: number | undefined;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(32);
    const read = fs.readSync(fd, buf, 0, 32, 0);
    const slice = buf.subarray(0, read);
    const detected = detectMimeFromBuffer(slice);
    if (!detected) {
      return { ok: false, reason: 'Unrecognized file signature' };
    }
    if (!mimeCompatible(claimedMime, detected)) {
      return { ok: false, reason: `MIME mismatch: claimed ${claimedMime}, detected ${detected}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'Unable to read uploaded file for validation' };
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}
