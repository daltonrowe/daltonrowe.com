// format detection and codec dispatch
//
// png is handled in pure js, jpeg and webp by the vendored wasm builds of
// mozjpeg and libwebp. everything decodes to rgba and encodes from rgba, so
// the graph above this layer never learns what a jpeg is.

import { wrapImage } from "../image.js";
import { decodePNG, encodePNG, isPNG } from "./png.js";
import {
  loadJPEGDecoder,
  loadJPEGEncoder,
  loadWebPDecoder,
  loadWebPEncoder,
} from "./wasm.js";

// these mirror the codec structs; overriding one leaves the rest alone

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

const WEBP_DEFAULTS = {
  quality: 75,
  target_size: 0,
  target_PSNR: 0,
  method: 4,
  sns_strength: 50,
  filter_strength: 60,
  filter_sharpness: 0,
  filter_type: 1,
  partitions: 0,
  segments: 4,
  pass: 1,
  show_compressed: 0,
  preprocessing: 0,
  autofilter: 0,
  partition_limit: 0,
  alpha_compression: 1,
  alpha_filtering: 1,
  alpha_quality: 100,
  lossless: 0,
  exact: 0,
  image_hint: 0,
  emulate_jpeg_size: 0,
  thread_level: 0,
  low_memory: 0,
  near_lossless: 100,
  use_delta_palette: 0,
  use_sharp_yuv: 0,
};

const EXTENSIONS = {
  jpg: "jpeg",
  jpeg: "jpeg",
  png: "png",
  webp: "webp",
};

// sniff the container rather than trusting a file extension

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
    throw new Error(`cannot tell an output format from ${JSON.stringify(filePath)}`);
  }

  return format;
}

export async function decode(buffer) {
  const format = detectFormat(buffer);

  if (format === "png") {
    return decodePNG(buffer);
  }

  if (format === "jpeg") {
    const codec = await loadJPEGDecoder();
    const result = codec.decode(buffer, false);

    if (!result) throw new Error("jpeg decode failed");

    return wrapImage(result.width, result.height, result.data);
  }

  if (format === "webp") {
    const codec = await loadWebPDecoder();
    const result = codec.decode(buffer);

    if (!result) throw new Error("webp decode failed");

    return wrapImage(result.width, result.height, result.data);
  }

  throw new Error("unrecognised image, expected png, jpeg or webp");
}

export async function encode(image, format, options = {}) {
  const { width, height, data } = image;

  if (format === "png") {
    return encodePNG(image, options);
  }

  if (format === "jpeg") {
    const codec = await loadJPEGEncoder();
    const settings = { ...JPEG_DEFAULTS, ...options };

    // mozjpeg only reads chroma_quality when told the two are separate
    if (options.chroma_quality !== undefined && options.separate_chroma_quality === undefined) {
      settings.separate_chroma_quality = true;
    }

    const result = codec.encode(data, width, height, settings);

    if (!result) throw new Error("jpeg encode failed");

    return Buffer.from(result);
  }

  if (format === "webp") {
    const codec = await loadWebPEncoder();
    const result = codec.encode(data, width, height, { ...WEBP_DEFAULTS, ...options });

    if (!result) throw new Error("webp encode failed");

    return Buffer.from(result);
  }

  throw new Error(`unknown output format ${JSON.stringify(format)}`);
}
