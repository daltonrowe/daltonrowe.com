// effects that read more than one image
//
// this is what the graph is for. everything else could be a chain of
// function calls; these need two branches to meet.

import { clamp255, createImage, likeImage, parseColor } from "../image.js";
import { defineEffect } from "../graph.js";

// blend modes operate on 0..1 channel values, per the usual definitions

const MODES = {
  normal: (_b, s) => s,
  multiply: (b, s) => b * s,
  screen: (b, s) => b + s - b * s,
  overlay: (b, s) => (b <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s)),
  softLight: (b, s) => (s <= 0.5 ? b - (1 - 2 * s) * b * (1 - b) : b + (2 * s - 1) * (Math.sqrt(b) - b)),
  hardLight: (b, s) => (s <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s)),
  add: (b, s) => b + s,
  subtract: (b, s) => b - s,
  difference: (b, s) => Math.abs(b - s),
  lighten: (b, s) => Math.max(b, s),
  darken: (b, s) => Math.min(b, s),
};

export const blendModes = Object.keys(MODES);

// draw b (the source) over a (the backdrop)
//
// output is a's size. b is placed at (x, y) and anything outside a is
// dropped, which keeps the node total rather than making callers match
// dimensions up front.

export const blend = defineEffect("blend", {
  inputs: 2,
  inputNames: ["a", "b"],
  params: { mode: "normal", opacity: 1, x: 0, y: 0 },
  apply([backdrop, source], { mode, opacity, x, y }) {
    const fn = MODES[mode];

    if (!fn) {
      throw new Error(`unknown blend mode ${JSON.stringify(mode)}, knows: ${blendModes.join(", ")}`);
    }

    const out = likeImage(backdrop);

    backdrop.data.copy(out.data);

    for (let sy = 0; sy < source.height; sy++) {
      const dy = sy + y;

      if (dy < 0 || dy >= backdrop.height) continue;

      for (let sx = 0; sx < source.width; sx++) {
        const dx = sx + x;

        if (dx < 0 || dx >= backdrop.width) continue;

        const si = (sy * source.width + sx) * 4;
        const di = (dy * backdrop.width + dx) * 4;

        const sa = (source.data[si + 3] / 255) * opacity;

        if (sa === 0) continue;

        const ba = out.data[di + 3] / 255;

        // source-over, with the blend applied against the backdrop colour
        const oa = sa + ba * (1 - sa);

        for (let c = 0; c < 3; c++) {
          const bc = out.data[di + c] / 255;
          const sc = fn(bc, source.data[si + c] / 255);

          // where the backdrop is transparent there is nothing to blend
          // against, so fall back to the source colour itself
          const mixed = bc * ba * (1 - sa) + (ba > 0 ? sc : source.data[si + c] / 255) * sa;

          out.data[di + c] = clamp255((oa === 0 ? 0 : mixed / oa) * 255);
        }

        out.data[di + 3] = clamp255(oa * 255);
      }
    }

    return out;
  },
});

// use b's luminance as a mask on a, so branches can be combined selectively

export const mask = defineEffect("mask", {
  inputs: 2,
  inputNames: ["a", "b"],
  params: { invert: false },
  apply([image, matte], { invert }) {
    const out = likeImage(image);

    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const i = (y * image.width + x) * 4;

        image.data.copy(out.data, i, i, i + 4);

        // outside the matte, leave the pixel fully masked out
        let value = 0;

        if (x < matte.width && y < matte.height) {
          const m = (y * matte.width + x) * 4;

          value =
            (matte.data[m] * 0.299 + matte.data[m + 1] * 0.587 + matte.data[m + 2] * 0.114) *
            (matte.data[m + 3] / 255);
        }

        const factor = (invert ? 255 - value : value) / 255;

        out.data[i + 3] = clamp255(image.data[i + 3] * factor);
      }
    }

    return out;
  },
});

// drop alpha against a background colour
//
// jpeg has no alpha channel. without this, transparent pixels reach the
// encoder as whatever colour happens to sit under them, which is usually
// black. render() calls this for you on jpeg output.

export const flatten = defineEffect("flatten", {
  params: { background: "#ffffff" },
  apply([image], { background }) {
    const [br, bg, bb] = parseColor(background);
    const out = createImage(image.width, image.height);

    for (let i = 0; i < image.data.length; i += 4) {
      const a = image.data[i + 3] / 255;

      out.data[i] = clamp255(image.data[i] * a + br * (1 - a));
      out.data[i + 1] = clamp255(image.data[i + 1] * a + bg * (1 - a));
      out.data[i + 2] = clamp255(image.data[i + 2] * a + bb * (1 - a));
      out.data[i + 3] = 255;
    }

    return out;
  },
});
