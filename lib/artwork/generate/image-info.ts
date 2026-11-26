import { deflateSync } from "node:zlib";

// Minimal PNG/JPEG helpers so the pipeline can check pixel sizes without a
// native image library. Resampling belongs to the compose phase.

export interface ImageInfo {
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  widthPx: number;
  heightPx: number;
}

export function readImageInfo(data: Uint8Array): ImageInfo | null {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  // PNG: signature + IHDR
  if (data.length >= 24 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    return { mimeType: "image/png", widthPx: view.getUint32(16), heightPx: view.getUint32(20) };
  }
  // JPEG: walk markers to the first SOFn
  if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < data.length) {
      if (data[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = data[offset + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      const length = view.getUint16(offset + 2);
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) return { mimeType: "image/jpeg", heightPx: view.getUint16(offset + 5), widthPx: view.getUint16(offset + 7) };
      offset += 2 + length;
    }
    return null;
  }
  // WebP (VP8X/VP8/VP8L) — only the extended header is needed for Gemini output if it ever appears.
  if (data.length >= 30 && String.fromCharCode(...data.slice(0, 4)) === "RIFF" && String.fromCharCode(...data.slice(8, 12)) === "WEBP") {
    const chunk = String.fromCharCode(...data.slice(12, 16));
    if (chunk === "VP8X") {
      const width = 1 + (data[24] | (data[25] << 8) | (data[26] << 16));
      const height = 1 + (data[27] | (data[28] << 8) | (data[29] << 16));
      return { mimeType: "image/webp", widthPx: width, heightPx: height };
    }
    if (chunk === "VP8 ") return { mimeType: "image/webp", widthPx: view.getUint16(26, true) & 0x3fff, heightPx: view.getUint16(28, true) & 0x3fff };
    if (chunk === "VP8L") {
      const bits = view.getUint32(21, true);
      return { mimeType: "image/webp", widthPx: (bits & 0x3fff) + 1, heightPx: ((bits >> 14) & 0x3fff) + 1 };
    }
  }
  return null;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Uint8Array) {
  const out = new Uint8Array(12 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(body, 8);
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
  return out;
}

/** Solid-colour RGB PNG of an exact pixel size. Used by the fake generator. */
export function solidPng(widthPx: number, heightPx: number, hex: string) {
  const match = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!match) throw new Error(`Not a hex colour: ${hex}`);
  const [r, g, b] = match.slice(1).map((part) => parseInt(part, 16));
  const row = new Uint8Array(1 + widthPx * 3);
  for (let x = 0; x < widthPx; x += 1) row.set([r, g, b], 1 + x * 3);
  const raw = new Uint8Array(row.length * heightPx);
  for (let y = 0; y < heightPx; y += 1) raw.set(row, y * row.length);
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, widthPx);
  view.setUint32(4, heightPx);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit, truecolour
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const parts = [signature, chunk("IHDR", header), chunk("IDAT", new Uint8Array(deflateSync(raw))), chunk("IEND", new Uint8Array())];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
