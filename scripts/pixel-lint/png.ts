// Minimal PNG writer (RGBA, 8 bit, no interlace) for lint screenshots: no dependencies.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Img } from './metrics.ts';

const CRC = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC[n] = c >>> 0;
}
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]!) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

export function encodePng(m: Img): Buffer {
  const raw = Buffer.alloc((m.w * 4 + 1) * m.h);
  for (let y = 0; y < m.h; y++) {
    raw[y * (m.w * 4 + 1)] = 0;
    Buffer.from(m.d.buffer, m.d.byteOffset + y * m.w * 4, m.w * 4).copy(raw, y * (m.w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(m.w, 0);
  ihdr.writeUInt32BE(m.h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', new Uint8Array(0))]);
}

export function savePng(path: string, m: Img): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePng(m));
}
