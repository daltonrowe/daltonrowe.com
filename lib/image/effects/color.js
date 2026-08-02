// per-pixel colour work
//
// these all read one pixel and write one pixel, so they share a helper and
// stay honest about not touching their neighbours.

import { clamp, clamp255, likeImage, luma, parseColor } from "../image.js";
import { defineEffect } from "../graph.js";

// map every pixel through fn(r, g, b, a) -> [r, g, b, a]

function mapPixels(image, fn) {
  const out = likeImage(image);
  const src = image.data;
  const dst = out.data;

  for (let i = 0; i < src.length; i += 4) {
    const [r, g, b, a] = fn(src[i], src[i + 1], src[i + 2], src[i + 3]);

    dst[i] = clamp255(r);
    dst[i + 1] = clamp255(g);
    dst[i + 2] = clamp255(b);
    dst[i + 3] = clamp255(a);
  }

  return out;
}

export const grayscale = defineEffect("grayscale", {
  params: { amount: 1 },
  apply([image], { amount }) {
    const t = clamp(amount, 0, 1);

    return mapPixels(image, (r, g, b, a) => {
      const l = luma(r, g, b);

      return [r + (l - r) * t, g + (l - g) * t, b + (l - b) * t, a];
    });
  },
});

export const invert = defineEffect("invert", {
  params: {},
  apply([image]) {
    return mapPixels(image, (r, g, b, a) => [255 - r, 255 - g, 255 - b, a]);
  },
});

// brightness and contrast in one pass, contrast pivoting around mid grey

export const adjust = defineEffect("adjust", {
  params: { brightness: 0, contrast: 0, saturation: 0 },
  apply([image], { brightness, contrast, saturation }) {
    const b255 = brightness * 255;
    const c = 1 + contrast;
    const s = 1 + saturation;

    return mapPixels(image, (r, g, b, a) => {
      let nr = (r - 128) * c + 128 + b255;
      let ng = (g - 128) * c + 128 + b255;
      let nb = (b - 128) * c + 128 + b255;

      if (s !== 1) {
        const l = luma(nr, ng, nb);

        nr = l + (nr - l) * s;
        ng = l + (ng - l) * s;
        nb = l + (nb - l) * s;
      }

      return [nr, ng, nb, a];
    });
  },
});

// remap the tonal range: anything at or below inLow goes to outLow, at or
// above inHigh goes to outHigh, gamma bends what happens between

export const levels = defineEffect("levels", {
  params: { inLow: 0, inHigh: 255, outLow: 0, outHigh: 255, gamma: 1 },
  apply([image], { inLow, inHigh, outLow, outHigh, gamma }) {
    const span = inHigh - inLow || 1;

    // 256 possible inputs per channel, so build the curve once
    const lut = new Uint8Array(256);

    for (let i = 0; i < 256; i++) {
      const normalised = clamp((i - inLow) / span, 0, 1);
      const curved = gamma === 1 ? normalised : normalised ** (1 / gamma);

      lut[i] = clamp255(outLow + curved * (outHigh - outLow));
    }

    return mapPixels(image, (r, g, b, a) => [lut[r], lut[g], lut[b], a]);
  },
});

// push the whole image onto a two-colour ramp, indexed by luminance

export const duotone = defineEffect("duotone", {
  params: { shadow: "#000000", highlight: "#ffffff", amount: 1 },
  apply([image], { shadow, highlight, amount }) {
    const [sr, sg, sb] = parseColor(shadow);
    const [hr, hg, hb] = parseColor(highlight);
    const t = clamp(amount, 0, 1);

    const lutR = new Uint8Array(256);
    const lutG = new Uint8Array(256);
    const lutB = new Uint8Array(256);

    for (let i = 0; i < 256; i++) {
      const l = i / 255;

      lutR[i] = clamp255(sr + (hr - sr) * l);
      lutG[i] = clamp255(sg + (hg - sg) * l);
      lutB[i] = clamp255(sb + (hb - sb) * l);
    }

    return mapPixels(image, (r, g, b, a) => {
      const l = clamp255(luma(r, g, b));

      return [r + (lutR[l] - r) * t, g + (lutG[l] - g) * t, b + (lutB[l] - b) * t, a];
    });
  },
});

// tint toward a single colour, keeping the original luminance

export const tint = defineEffect("tint", {
  params: { color: "#ffffff", amount: 0.5 },
  apply([image], { color, amount }) {
    const [tr, tg, tb] = parseColor(color);
    const t = clamp(amount, 0, 1);

    return mapPixels(image, (r, g, b, a) => {
      const l = luma(r, g, b) / 255;

      return [r + (tr * l - r) * t, g + (tg * l - g) * t, b + (tb * l - b) * t, a];
    });
  },
});

export const threshold = defineEffect("threshold", {
  params: { level: 128 },
  apply([image], { level }) {
    return mapPixels(image, (r, g, b, a) => {
      const on = luma(r, g, b) >= level ? 255 : 0;

      return [on, on, on, a];
    });
  },
});

// crush each channel down to a fixed number of steps

export const posterize = defineEffect("posterize", {
  params: { steps: 6 },
  apply([image], { steps }) {
    const n = Math.max(2, Math.round(steps));
    const lut = new Uint8Array(256);

    for (let i = 0; i < 256; i++) {
      lut[i] = clamp255(Math.round((i / 255) * (n - 1)) * (255 / (n - 1)));
    }

    return mapPixels(image, (r, g, b, a) => [lut[r], lut[g], lut[b], a]);
  },
});

export const opacity = defineEffect("opacity", {
  params: { amount: 1 },
  apply([image], { amount }) {
    const t = clamp(amount, 0, 1);

    return mapPixels(image, (r, g, b, a) => [r, g, b, a * t]);
  },
});
