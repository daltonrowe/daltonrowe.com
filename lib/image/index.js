// node based image effects
//
//   import { source, blur, duotone, write } from "./lib/image/index.js";
//
//   const photo = source({ file: "articles/mouth/mouth.png" });
//   const look = duotone(blur(photo, { radius: 6 }), { shadow: "#140a3c" });
//
//   await write(look, "dist/mouth.jpg", { quality: 82 });
//
// effects return nodes, not pixels. nothing is decoded or processed until
// write() or render() asks for a result, and a node feeding two branches is
// still only evaluated once.

import * as fs from "node:fs";
import * as path from "node:path";

import { encode, formatForPath } from "./codecs/index.js";
import { render } from "./graph.js";
import { flatten } from "./effects/composite.js";

export * from "./effects/index.js";

export {
  defineEffect,
  describe,
  fromJSON,
  getEffect,
  isNode,
  listEffects,
  render,
  toJSON,
} from "./graph.js";

export { createImage, parseColor, wrapImage } from "./image.js";
export { decode, detectFormat, encode, formatForPath } from "./codecs/index.js";

// render a node and encode it, without touching the filesystem

export async function toBuffer(node, options = {}) {
  const format = options.format ?? "png";

  // jpeg cannot carry alpha, so composite onto a background first rather
  // than letting the encoder guess
  const target = format === "jpeg" ? flatten(node, { background: options.background ?? "#ffffff" }) : node;

  const image = await render(target, { cache: options.cache, onNode: options.onNode });

  return encode(image, format, options);
}

// render a node and write it out, taking the format from the extension

export async function write(node, file, options = {}) {
  const format = options.format ?? formatForPath(file);
  const buffer = await toBuffer(node, { ...options, format });

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buffer);

  return { file, format, bytes: buffer.length };
}
