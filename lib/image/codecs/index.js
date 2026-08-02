// format detection and codec dispatch
//
// png in, png or jpeg out. png is handled in pure js on node:zlib; jpeg
// output goes through the vendored mozjpeg build. everything decodes to rgba
// and encodes from rgba, so the graph above this layer never learns what a
// jpeg is.
//
// there is no jpeg or webp decoder here on purpose — see codecs/vendor for
// what that bought and what it cost.

import { decodePNG, encodePNG, isPNG } from "./png.js";
import { loadJPEGEncoder } from "./wasm.js";

// mirrors the mozjpeg struct; overriding one field leaves the rest alone

const JPEG_DEFAULTS = {
  quality: 75,
  baseline: false,
  arithmetic: false,
  progressive: true,
  optimize_coding: true,
  smoothing: 0,
  color_space: 3, // ycbcr
  quant_table: 3,
  trellis_multipass: false,
  trellis_opt_zero: false,
  trellis_opt_table: false,
  trellis_loops: 1,
  auto_subsample: true,
  chroma_subsample: 2,
  separate_chroma_quality: false,
  chroma_quality: 75,
};

const EXTENSIONS = {
  jpg: "jpeg",
  jpeg: "jpeg",
  png: "png",
};

// sniff the container rather than trusting a file extension
//
// jpeg and webp are still recognised even though neither can be decoded, so
// feeding one in says what is wrong instead of "unrecognised image"

export function detectFormat(buffer) {
  if (isPNG(buffer)) return "png";

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg";
  }

  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }

  return null;
}

export function formatForPath(filePath) {
  const ext = filePath.split(".").pop().toLowerCase();
  const format = EXTENSIONS[ext];

  if (!format) {
    throw new Error(
      `cannot tell an output format from ${JSON.stringify(filePath)}, expected .png, .jpg or .jpeg`,
    );
  }

  return format;
}

export async function decode(buffer) {
  const format = detectFormat(buffer);

  if (format === "png") return decodePNG(buffer);

  if (format) {
    throw new Error(
      `this build reads png only, got ${format}. convert the source to png, ` +
        "or vendor the decoder back in — see lib/image/codecs/vendor/README.md",
    );
  }

  throw new Error("unrecognised image, expected png");
}

export async function encode(image, format, options = {}) {
  if (format === "png") return encodePNG(image, options);

  if (format === "jpeg") {
    const codec = await loadJPEGEncoder();
    const settings = { ...JPEG_DEFAULTS, ...options };

    // mozjpeg only reads chroma_quality when told the two are separate
    if (options.chroma_quality !== undefined && options.separate_chroma_quality === undefined) {
      settings.separate_chroma_quality = true;
    }

    const result = codec.encode(image.data, image.width, image.height, settings);

    if (!result) throw new Error("jpeg encode failed");

    return Buffer.from(result);
  }

  throw new Error(`unknown output format ${JSON.stringify(format)}, expected png or jpeg`);
}
