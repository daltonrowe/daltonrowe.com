// png read/write on node:zlib alone
//
// there is no wasm here on purpose. png is deflate plus five scanline
// filters, both of which node already has, so a codec costs less than the
// loader that would fetch one. handles 8-bit non-interlaced pngs, which is
// every png a build step is likely to meet.

import * as zlib from "node:zlib";

import { wrapImage } from "../image.js";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

// crc32 over the chunk type and body, per the png spec

const crc32 = (() => {
  const table = new Int32Array(256);

  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }

  return (buf) => {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

export function isPNG(buffer) {
  return buffer.length >= 8 && buffer.subarray(0, 8).equals(SIGNATURE);
}

// walk the chunk list, keeping only what we need to reconstruct pixels

function readChunks(buffer) {
  const idat = [];
  let header = null;
  let palette = null;
  let transparency = null;
  let pos = 8;

  while (pos + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(pos);
    const type = buffer.toString("ascii", pos + 4, pos + 8);
    const body = buffer.subarray(pos + 8, pos + 8 + length);

    if (type === "IHDR") {
      header = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        depth: body[8],
        colorType: body[9],
        interlace: body[12],
      };
    } else if (type === "PLTE") {
      palette = body;
    } else if (type === "tRNS") {
      transparency = body;
    } else if (type === "IDAT") {
      idat.push(body);
    } else if (type === "IEND") {
      break;
    }

    pos += 12 + length;
  }

  if (!header) throw new Error("png has no IHDR chunk");

  return { header, palette, transparency, idat };
}

// undo the per-scanline filter each row was encoded with

function unfilter(raw, width, height, channels) {
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;

    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? out[i - channels] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= channels ? prev[i - channels] : 0;

      let value = line[i];

      if (filter === 1) {
        value += a;
      } else if (filter === 2) {
        value += b;
      } else if (filter === 3) {
        value += (a + b) >> 1;
      } else if (filter === 4) {
        // paeth: pick whichever neighbour the gradient predicts
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);

        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) {
        throw new Error(`unknown png filter ${filter} on row ${y}`);
      }

      out[i] = value & 0xff;
    }
  }

  return pixels;
}

export function decodePNG(buffer) {
  const { header, palette, transparency, idat } = readChunks(buffer);
  const { width, height, depth, colorType, interlace } = header;

  if (depth !== 8) {
    throw new Error(`png bit depth ${depth} is not supported, re-save as 8-bit`);
  }

  if (interlace) {
    throw new Error("interlaced (adam7) png is not supported, re-save without interlacing");
  }

  const channels = CHANNELS[colorType];

  if (!channels) throw new Error(`unknown png color type ${colorType}`);

  if (colorType === 3 && !palette) throw new Error("indexed png has no PLTE chunk");

  const pixels = unfilter(zlib.inflateSync(Buffer.concat(idat)), width, height, channels);

  // widen whatever we decoded out to rgba, so the graph only sees one layout
  const rgba = Buffer.alloc(width * height * 4);

  for (let i = 0, total = width * height; i < total; i++) {
    let r;
    let g;
    let b;
    let a = 255;

    if (colorType === 0) {
      r = g = b = pixels[i];
    } else if (colorType === 2) {
      r = pixels[i * 3];
      g = pixels[i * 3 + 1];
      b = pixels[i * 3 + 2];
    } else if (colorType === 3) {
      const index = pixels[i];

      r = palette[index * 3];
      g = palette[index * 3 + 1];
      b = palette[index * 3 + 2];

      if (transparency && index < transparency.length) a = transparency[index];
    } else if (colorType === 4) {
      r = g = b = pixels[i * 2];
      a = pixels[i * 2 + 1];
    } else {
      r = pixels[i * 4];
      g = pixels[i * 4 + 1];
      b = pixels[i * 4 + 2];
      a = pixels[i * 4 + 3];
    }

    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = a;
  }

  return wrapImage(width, height, rgba);
}

function chunk(type, body) {
  const out = Buffer.alloc(12 + body.length);

  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, "ascii");
  body.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);

  return out;
}

// pick the filter whose output has the smallest total deviation, which is a
// good cheap stand-in for whichever one will actually deflate smallest

function filterRow(line, prev, channels, stride) {
  const candidates = [];

  for (let filter = 0; filter <= 4; filter++) {
    const out = Buffer.alloc(stride + 1);
    out[0] = filter;

    let score = 0;

    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= channels ? prev[i - channels] : 0;

      let value = line[i];

      if (filter === 1) {
        value -= a;
      } else if (filter === 2) {
        value -= b;
      } else if (filter === 3) {
        value -= (a + b) >> 1;
      } else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);

        value -= pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }

      value &= 0xff;
      out[i + 1] = value;
      score += value < 128 ? value : 256 - value;
    }

    candidates.push({ out, score });
  }

  return candidates.reduce((best, next) => (next.score < best.score ? next : best)).out;
}

export function encodePNG(image, options = {}) {
  const { width, height, data } = image;
  const level = options.level ?? 9;
  const stride = width * 4;

  const raw = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y++) {
    const line = data.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? data.subarray((y - 1) * stride, y * stride) : null;

    filterRow(line, prev, 4, stride).copy(raw, y * (stride + 1));
  }

  const ihdr = Buffer.alloc(13);

  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: rgba

  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
