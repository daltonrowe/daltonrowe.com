// size and framing

import { clamp, createImage, parseColor } from "../image.js";
import { defineEffect } from "../graph.js";

// area-average downscale, bilinear upscale
//
// downscaling by picking nearest pixels throws away most of the image and
// aliases badly, so shrinking averages every source pixel that falls under
// the destination pixel instead. growing has no such problem and can
// interpolate.

function resample(image, width, height) {
  const out = createImage(width, height);
  const scaleX = image.width / width;
  const scaleY = image.height / height;
  const shrinking = scaleX > 1 || scaleY > 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;

      if (shrinking) {
        const x0 = Math.floor(x * scaleX);
        const y0 = Math.floor(y * scaleY);
        const x1 = Math.min(image.width, Math.max(x0 + 1, Math.ceil((x + 1) * scaleX)));
        const y1 = Math.min(image.height, Math.max(y0 + 1, Math.ceil((y + 1) * scaleY)));

        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        let n = 0;

        for (let sy = y0; sy < y1; sy++) {
          for (let sx = x0; sx < x1; sx++) {
            const i = (sy * image.width + sx) * 4;

            r += image.data[i];
            g += image.data[i + 1];
            b += image.data[i + 2];
            a += image.data[i + 3];
            n++;
          }
        }

        out.data[o] = r / n;
        out.data[o + 1] = g / n;
        out.data[o + 2] = b / n;
        out.data[o + 3] = a / n;
      } else {
        // sample at pixel centres so the output is not shifted half a pixel
        const fx = clamp((x + 0.5) * scaleX - 0.5, 0, image.width - 1);
        const fy = clamp((y + 0.5) * scaleY - 0.5, 0, image.height - 1);
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const x1 = Math.min(x0 + 1, image.width - 1);
        const y1 = Math.min(y0 + 1, image.height - 1);
        const tx = fx - x0;
        const ty = fy - y0;

        for (let c = 0; c < 4; c++) {
          const p00 = image.data[(y0 * image.width + x0) * 4 + c];
          const p10 = image.data[(y0 * image.width + x1) * 4 + c];
          const p01 = image.data[(y1 * image.width + x0) * 4 + c];
          const p11 = image.data[(y1 * image.width + x1) * 4 + c];

          const top = p00 + (p10 - p00) * tx;
          const bottom = p01 + (p11 - p01) * tx;

          out.data[o + c] = top + (bottom - top) * ty;
        }
      }
    }
  }

  return out;
}

// give width, height, or both. one alone keeps the aspect ratio.

export const resize = defineEffect("resize", {
  params: { width: null, height: null, fit: "stretch" },
  apply([image], { width, height, fit }) {
    let targetWidth = width;
    let targetHeight = height;

    if (!targetWidth && !targetHeight) throw new Error("resize needs a width or a height");

    if (!targetWidth) targetWidth = Math.round((targetHeight / image.height) * image.width);
    if (!targetHeight) targetHeight = Math.round((targetWidth / image.width) * image.height);

    if (fit === "contain" || fit === "cover") {
      const scaleX = targetWidth / image.width;
      const scaleY = targetHeight / image.height;
      const scale = fit === "contain" ? Math.min(scaleX, scaleY) : Math.max(scaleX, scaleY);

      const fitted = resample(
        image,
        Math.max(1, Math.round(image.width * scale)),
        Math.max(1, Math.round(image.height * scale)),
      );

      // contain leaves the image smaller than the frame, cover leaves it
      // larger; either way centre it and let crop trim the difference
      return cropTo(fitted, targetWidth, targetHeight, [0, 0, 0, 0]);
    }

    return resample(image, Math.max(1, targetWidth), Math.max(1, targetHeight));
  },
});

function cropTo(image, width, height, background) {
  const out = createImage(width, height, background);
  const offsetX = Math.round((width - image.width) / 2);
  const offsetY = Math.round((height - image.height) / 2);

  for (let y = 0; y < height; y++) {
    const sy = y - offsetY;

    if (sy < 0 || sy >= image.height) continue;

    for (let x = 0; x < width; x++) {
      const sx = x - offsetX;

      if (sx < 0 || sx >= image.width) continue;

      image.data.copy(out.data, (y * width + x) * 4, (sy * image.width + sx) * 4, (sy * image.width + sx) * 4 + 4);
    }
  }

  return out;
}

export const crop = defineEffect("crop", {
  params: { x: 0, y: 0, width: null, height: null, background: "#00000000" },
  apply([image], { x, y, width, height, background }) {
    const w = Math.max(1, width ?? image.width - x);
    const h = Math.max(1, height ?? image.height - y);
    const out = createImage(w, h, parseColor(background));

    for (let dy = 0; dy < h; dy++) {
      const sy = y + dy;

      if (sy < 0 || sy >= image.height) continue;

      for (let dx = 0; dx < w; dx++) {
        const sx = x + dx;

        if (sx < 0 || sx >= image.width) continue;

        const from = (sy * image.width + sx) * 4;

        image.data.copy(out.data, (dy * w + dx) * 4, from, from + 4);
      }
    }

    return out;
  },
});

export const flip = defineEffect("flip", {
  params: { horizontal: false, vertical: false },
  apply([image], { horizontal, vertical }) {
    const { width, height } = image;
    const out = createImage(width, height);

    for (let y = 0; y < height; y++) {
      const sy = vertical ? height - 1 - y : y;

      for (let x = 0; x < width; x++) {
        const sx = horizontal ? width - 1 - x : x;
        const from = (sy * width + sx) * 4;

        image.data.copy(out.data, (y * width + x) * 4, from, from + 4);
      }
    }

    return out;
  },
});
