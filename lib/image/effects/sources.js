// nodes that make pixels out of nothing (or out of a file)

import * as fs from "node:fs";
import * as path from "node:path";

import { decode } from "../codecs/index.js";
import { createImage, parseColor } from "../image.js";
import { defineEffect } from "../graph.js";

// read a png off disk
//
// paths are resolved from the repo root so a graph reads the same wherever
// it is run from

export const source = defineEffect("source", {
  inputs: 0,
  params: { file: null },
  async apply(_inputs, { file }) {
    if (!file) throw new Error("source needs a file");

    const root = path.join(import.meta.dirname, "..", "..", "..");
    const resolved = path.isAbsolute(file) ? file : path.join(root, file);

    return decode(fs.readFileSync(resolved));
  },
});

// a flat field, useful as a blend input or a backdrop for flatten

export const solid = defineEffect("solid", {
  inputs: 0,
  params: { width: 512, height: 512, color: "#000000" },
  apply(_inputs, { width, height, color }) {
    return createImage(width, height, parseColor(color));
  },
});

// a vertical or horizontal ramp between two colors

export const gradient = defineEffect("gradient", {
  inputs: 0,
  params: { width: 512, height: 512, from: "#000000", to: "#ffffff", angle: "vertical" },
  apply(_inputs, { width, height, from, to, angle }) {
    const [r1, g1, b1, a1] = parseColor(from);
    const [r2, g2, b2, a2] = parseColor(to);
    const image = createImage(width, height);
    const { data } = image;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const span = angle === "horizontal" ? width : height;
        const along = angle === "horizontal" ? x : y;
        const t = span === 1 ? 0 : along / (span - 1);
        const i = (y * width + x) * 4;

        data[i] = r1 + (r2 - r1) * t;
        data[i + 1] = g1 + (g2 - g1) * t;
        data[i + 2] = b1 + (b2 - b1) * t;
        data[i + 3] = a1 + (a2 - a1) * t;
      }
    }

    return image;
  },
});
