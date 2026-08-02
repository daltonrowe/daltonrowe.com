// effects that read a pixel's neighbours

import { clamp, clamp255, likeImage, luma } from "../image.js";
import { defineEffect } from "../graph.js";

// separable box blur
//
// a radius r box blur done naively costs (2r+1)^2 reads per pixel. running
// it horizontally then vertically gets the same answer for 2(2r+1), and
// stacking three passes approximates a gaussian closely enough that the
// difference is invisible at these bit depths.

function boxPass(image, radius, vertical) {
  const { width, height, data } = image;
  const out = likeImage(image);
  const outer = vertical ? width : height;
  const inner = vertical ? height : width;
  const step = (vertical ? width : 1) * 4;

  for (let o = 0; o < outer; o++) {
    const base = (vertical ? o : o * width) * 4;

    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    let n = 0;

    // prime the window with everything from 0 up to radius
    for (let i = 0; i <= radius && i < inner; i++) {
      const p = base + i * step;

      r += data[p];
      g += data[p + 1];
      b += data[p + 2];
      a += data[p + 3];
      n++;
    }

    for (let i = 0; i < inner; i++) {
      const p = base + i * step;

      out.data[p] = r / n;
      out.data[p + 1] = g / n;
      out.data[p + 2] = b / n;
      out.data[p + 3] = a / n;

      // slide: drop the pixel leaving the window, add the one entering
      const leaving = i - radius;
      const entering = i + radius + 1;

      if (leaving >= 0) {
        const q = base + leaving * step;

        r -= data[q];
        g -= data[q + 1];
        b -= data[q + 2];
        a -= data[q + 3];
        n--;
      }

      if (entering < inner) {
        const q = base + entering * step;

        r += data[q];
        g += data[q + 1];
        b += data[q + 2];
        a += data[q + 3];
        n++;
      }
    }
  }

  return out;
}

export const blur = defineEffect("blur", {
  params: { radius: 4, passes: 3 },
  apply([image], { radius, passes }) {
    const r = Math.max(0, Math.round(radius));

    if (r === 0) return image;

    let current = image;

    for (let pass = 0; pass < Math.max(1, passes); pass++) {
      current = boxPass(boxPass(current, r, false), r, true);
    }

    return current;
  },
});

// unsharp mask: subtract a blurred copy to leave the detail, add it back

export const sharpen = defineEffect("sharpen", {
  params: { amount: 1, radius: 1 },
  apply([image], { amount, radius }) {
    const r = Math.max(1, Math.round(radius));
    const blurred = boxPass(boxPass(image, r, false), r, true);
    const out = likeImage(image);

    for (let i = 0; i < image.data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const original = image.data[i + c];

        out.data[i + c] = clamp255(original + (original - blurred.data[i + c]) * amount);
      }

      out.data[i + 3] = image.data[i + 3];
    }

    return out;
  },
});

// darken toward the edges of the frame

export const vignette = defineEffect("vignette", {
  params: { amount: 0.6, radius: 0.75, softness: 0.45 },
  apply([image], { amount, radius, softness }) {
    const { width, height } = image;
    const out = likeImage(image);
    const cx = width / 2;
    const cy = height / 2;
    const maxDistance = Math.hypot(cx, cy);
    const feather = Math.max(0.0001, softness);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const distance = Math.hypot(x - cx, y - cy) / maxDistance;

        // 0 inside the clear radius, ramping to 1 across the feather
        const falloff = clamp((distance - radius) / feather, 0, 1);
        const scale = 1 - falloff * amount;
        const i = (y * width + x) * 4;

        out.data[i] = clamp255(image.data[i] * scale);
        out.data[i + 1] = clamp255(image.data[i + 1] * scale);
        out.data[i + 2] = clamp255(image.data[i + 2] * scale);
        out.data[i + 3] = image.data[i + 3];
      }
    }

    return out;
  },
});

// deterministic value noise, so the same graph always renders the same file
//
// a build step that produced a different jpeg on every run would churn the
// diff for no reason, so the seed drives a small integer hash rather than
// Math.random.

function hashNoise(seed, index) {
  let h = (seed ^ index) >>> 0;

  h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;

  return h / 4294967295;
}

export const grain = defineEffect("grain", {
  params: { amount: 0.12, seed: 1, monochrome: true },
  apply([image], { amount, seed, monochrome }) {
    const out = likeImage(image);
    const strength = amount * 255;

    for (let i = 0, p = 0; i < image.data.length; i += 4, p++) {
      const shared = (hashNoise(seed, p) - 0.5) * strength;

      for (let c = 0; c < 3; c++) {
        const n = monochrome ? shared : (hashNoise(seed + c * 7919, p) - 0.5) * strength;

        out.data[i + c] = clamp255(image.data[i + c] + n);
      }

      out.data[i + 3] = image.data[i + 3];
    }

    return out;
  },
});

// ordered dithering on a bayer matrix
//
// this is the one that reads as deliberate rather than broken when an image
// is knocked down to very few colours.

const BAYER_8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

export const dither = defineEffect("dither", {
  params: { steps: 2, monochrome: true },
  apply([image], { steps, monochrome }) {
    const { width, height } = image;
    const out = likeImage(image);
    const n = Math.max(2, Math.round(steps));
    const levels = n - 1;
    const spread = 255 / levels;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;

        // bayer value recentred to [-0.5, 0.5) then scaled to one step
        const bias = (BAYER_8[y & 7][x & 7] / 64 - 0.5) * spread;

        if (monochrome) {
          const value = luma(image.data[i], image.data[i + 1], image.data[i + 2]) + bias;
          const quantised = clamp255(Math.round(clamp(value, 0, 255) / spread) * spread);

          out.data[i] = quantised;
          out.data[i + 1] = quantised;
          out.data[i + 2] = quantised;
        } else {
          for (let c = 0; c < 3; c++) {
            const value = image.data[i + c] + bias;

            out.data[i + c] = clamp255(Math.round(clamp(value, 0, 255) / spread) * spread);
          }
        }

        out.data[i + 3] = image.data[i + 3];
      }
    }

    return out;
  },
});

// slide the colour channels apart, the chromatic aberration look

export const channelShift = defineEffect("channelShift", {
  params: { red: [-2, 0], green: [0, 0], blue: [2, 0] },
  apply([image], { red, green, blue }) {
    const { width, height } = image;
    const out = likeImage(image);
    const offsets = [red, green, blue];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;

        for (let c = 0; c < 3; c++) {
          const [dx, dy] = offsets[c];
          const sx = clamp(x - dx, 0, width - 1);
          const sy = clamp(y - dy, 0, height - 1);

          out.data[i + c] = image.data[(sy * width + sx) * 4 + c];
        }

        out.data[i + 3] = image.data[i + 3];
      }
    }

    return out;
  },
});
