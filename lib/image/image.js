// the one value that flows through the graph
//
// every node takes and returns this shape. data is always straight (not
// premultiplied) 8-bit RGBA, tightly packed, length width * height * 4.

export function createImage(width, height, fill) {
  const data = Buffer.alloc(width * height * 4);

  if (fill) {
    const [r, g, b, a] = fill;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }

  return { width, height, data };
}

// wrap raw bytes without copying, checking they are the size they claim

export function wrapImage(width, height, data) {
  const expected = width * height * 4;
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data.buffer ?? data, data.byteOffset ?? 0, data.byteLength ?? data.length);

  if (buf.length !== expected) {
    throw new Error(`expected ${expected} bytes for ${width}x${height} rgba, got ${buf.length}`);
  }

  return { width, height, data: buf };
}

export function cloneImage(image) {
  return {
    width: image.width,
    height: image.height,
    data: Buffer.from(image.data),
  };
}

// an image the same size as the input, with its own buffer to write into

export function likeImage(image) {
  return createImage(image.width, image.height);
}

export function assertImage(value, where) {
  if (!value || typeof value.width !== "number" || !Buffer.isBuffer(value.data)) {
    throw new Error(`${where} did not return an image`);
  }

  return value;
}

// #rgb / #rrggbb / #rrggbbaa / [r,g,b] / [r,g,b,a] -> [r,g,b,a]

export function parseColor(color) {
  if (Array.isArray(color)) {
    const [r, g, b, a = 255] = color;
    return [r, g, b, a];
  }

  if (typeof color !== "string") {
    throw new Error(`cannot read color ${JSON.stringify(color)}`);
  }

  let hex = color.trim().replace(/^#/, "");

  if (hex.length === 3 || hex.length === 4) {
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  }

  if (hex.length !== 6 && hex.length !== 8) {
    throw new Error(`cannot read color ${JSON.stringify(color)}`);
  }

  const int = Number.parseInt(hex, 16);

  if (Number.isNaN(int)) {
    throw new Error(`cannot read color ${JSON.stringify(color)}`);
  }

  if (hex.length === 6) {
    return [(int >> 16) & 255, (int >> 8) & 255, int & 255, 255];
  }

  return [(int >>> 24) & 255, (int >>> 16) & 255, (int >>> 8) & 255, int & 255];
}

export function clamp255(value) {
  if (value < 0) return 0;
  if (value > 255) return 255;
  return value | 0;
}

export function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

// rec. 601 luma, matching what the jpeg encoder will do downstream

export function luma(r, g, b) {
  return r * 0.299 + g * 0.587 + b * 0.114;
}

// read a pixel with edge clamping, for kernels that walk off the image

export function sampleClamped(image, x, y) {
  const sx = clamp(x, 0, image.width - 1);
  const sy = clamp(y, 0, image.height - 1);

  return (sy * image.width + sx) * 4;
}
