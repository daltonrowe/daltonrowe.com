// example graphs
//
//   node scripts/fx.js graphs/example.js
//
// copy this file, point it at your own images, delete what you do not want.

import {
  adjust,
  blend,
  blur,
  channelShift,
  dither,
  duotone,
  grain,
  resize,
  source,
  vignette,
} from "../lib/image/index.js";

const photo = source({ file: "articles/inside-out/xmas-big.png" });

// a reasonable article thumbnail: resize, lift the contrast, darken the edges
const thumbnail = vignette(adjust(resize(photo, { width: 800 }), { contrast: 0.12, saturation: 0.1 }), {
  amount: 0.45,
});

// photo appears in both branches below and is decoded once for the whole file

const small = resize(photo, { width: 800 });

// bloom: screen a blurred copy back over the original, which lifts the
// highlights without flattening everything else
const bloom = blend({ a: small, b: blur(small, { radius: 10 }) }, { mode: "screen", opacity: 0.55 });

// a duotone treatment with film grain on top
const treated = grain(duotone(small, { shadow: "#140a3c", highlight: "#ffe6b4" }), { amount: 0.1 });

// something obviously processed, for the effects that are meant to be seen
const glitch = channelShift(dither(resize(photo, { width: 600 }), { steps: 4, monochrome: false }), {
  red: [-3, 1],
  blue: [3, -1],
});

export default [
  { node: thumbnail, file: "dist/fx/thumbnail.jpg", options: { quality: 82 } },
  { node: bloom, file: "dist/fx/bloom.jpg", options: { quality: 84 } },
  { node: treated, file: "dist/fx/duotone.jpg", options: { quality: 82 } },
  { node: glitch, file: "dist/fx/glitch.jpg", options: { quality: 85 } },
  { node: treated, file: "dist/fx/duotone.png" },
];
