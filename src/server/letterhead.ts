import { z } from 'zod';
import { inflateSync } from 'node:zlib';
import type { Database } from './db.js';
import { emptyLetterhead, type Letterhead } from '../shared/letterhead.js';

/** Embedded raster logos avoid remote requests, SVG scripts, and mutable document assets. */
export function validLogo(value: string): boolean {
  if (!value) return true;
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || value.length > 220000) return false;
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > 160 * 1024 || bytes.toString('base64') !== match[2]) return false;
  if (match[1] === 'png') {
    if (
      bytes.length < 33 ||
      bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
      bytes.readUInt32BE(8) !== 13 ||
      bytes.subarray(12, 16).toString() !== 'IHDR'
    )
      return false;
    const width = bytes.readUInt32BE(16),
      height = bytes.readUInt32BE(20);
    if (!(width > 0 && height > 0 && width <= 2000 && height <= 2000)) return false;
    const depths: Record<number, number[]> = {
      0: [1, 2, 4, 8, 16],
      2: [8, 16],
      3: [1, 2, 4, 8],
      4: [8, 16],
      6: [8, 16],
    };
    if (
      !depths[bytes[25]]?.includes(bytes[24]) ||
      bytes[26] !== 0 ||
      bytes[27] !== 0 ||
      bytes[28] > 1
    )
      return false;
    const chunks: Buffer[] = [];
    let ended = false;
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = bytes.readUInt32BE(offset),
        kind = bytes.subarray(offset + 4, offset + 8).toString();
      if (offset + length + 12 > bytes.length) return false;
      if (kind === 'IDAT') chunks.push(bytes.subarray(offset + 8, offset + 8 + length));
      offset += length + 12;
      if (kind === 'IEND') {
        ended = length === 0 && offset === bytes.length;
        break;
      }
    }
    if (!ended || !chunks.length) return false;
    try {
      return inflateSync(Buffer.concat(chunks), { maxOutputLength: 40_000_000 }).length > 0;
    } catch {
      return false;
    }
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9)
    return false;
  for (let offset = 2; offset + 8 < bytes.length;) {
    if (bytes[offset] !== 0xff) return false;
    const marker = bytes[offset + 1],
      length = bytes.readUInt16BE(offset + 2);
    if (length < 2 || offset + length + 2 > bytes.length) return false;
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      const height = bytes.readUInt16BE(offset + 5),
        width = bytes.readUInt16BE(offset + 7);
      return width > 0 && height > 0 && width <= 2000 && height <= 2000;
    }
    offset += length + 2;
  }
  return false;
}
export const letterheadSchema = z
  .object({
    logoDataUrl: z
      .string()
      .max(220000)
      .refine(validLogo, 'Use a PNG or JPEG logo, at most 160 KB and 2000 × 2000 pixels.'),
    header: z.string().trim().max(500),
    address: z.string().trim().max(1000),
    footer: z.string().trim().max(500),
  })
  .strict();

export async function readLetterhead(db: Database, tenantId: number): Promise<Letterhead> {
  const row = (await db.query('SELECT letterhead FROM tenants WHERE id=$1', [tenantId])).rows[0];
  return { ...emptyLetterhead, ...row?.letterhead };
}
