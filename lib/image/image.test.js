// node --test

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  blend,
  blur,
  createImage,
  decode,
  defineEffect,
  describe,
  detectFormat,
  duotone,
  encode,
  flatten,
  formatForPath,
  fromJSON,
  gradient,
  grain,
  render,
  resize,
  solid,
  source,
  toBuffer,
  toJSON,
} from "./index.js";

const PNG = "articles/mouth/mouth.png";
const JPEG = "articles/inside-out/stagetids.jpg";
const WEBP = "articles/soundsleeper/app.webp";

// a counting effect, so tests can assert how often the graph ran something

let applied = 0;

const counted = defineEffect("test:counted", {
  params: {},
  apply([image]) {
    applied++;
    return image;
  },
});

test("decodes png to rgba", async () => {
  const image = await render(source({ file: PNG }));

  assert.ok(image.width > 0 && image.height > 0, "png has no size");
  assert.equal(image.data.length, image.width * image.height * 4, "png is not tightly packed rgba");
});

test("jpeg and webp input say what is wrong, not just that it failed", async () => {
  for (const file of [JPEG, WEBP]) {
    await assert.rejects(() => render(source({ file })), /reads png only/, `${file} gave an unhelpful error`);
  }
});

test("a file that is no image at all is reported as such", async () => {
  await assert.rejects(() => decode(Buffer.from("not an image")), /unrecognised image/);
});

test("a node feeding two branches is applied once", async () => {
  applied = 0;

  const shared = counted(solid({ width: 8, height: 8, color: "#336699" }));

  // both inputs of the blend walk back to the same node
  await render(blend({ a: shared, b: blur(shared, { radius: 1 }) }, { mode: "screen" }));

  assert.equal(applied, 1);
});

test("render reuses a cache across calls", async () => {
  applied = 0;

  const shared = counted(solid({ width: 8, height: 8 }));
  const cache = new Map();

  await render(shared, { cache });
  await render(blur(shared, { radius: 1 }), { cache });

  assert.equal(applied, 1);
});

test("png survives a round trip unchanged", async () => {
  const original = await render(gradient({ width: 32, height: 16, from: "#102030", to: "#ffcc00" }));
  const decoded = await decode(await encode(original, "png"));

  assert.equal(decoded.width, original.width);
  assert.equal(decoded.height, original.height);
  assert.deepEqual(decoded.data, original.data);
});

test("png decodes what it encodes for every colour type it emits", async () => {
  // rgba with real transparency, the case the filters are most likely to break
  const image = createImage(9, 7);

  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i] = (i * 7) & 255;
    image.data[i + 1] = (i * 13) & 255;
    image.data[i + 2] = (i * 29) & 255;
    image.data[i + 3] = (i * 3) & 255;
  }

  const decoded = await decode(await encode(image, "png"));

  assert.deepEqual(decoded.data, image.data);
});

test("jpeg encodes to a jpeg container", async () => {
  const image = await render(resize(source({ file: PNG }), { width: 64 }));
  const jpeg = await encode(image, "jpeg", { quality: 70 });

  assert.deepEqual([...jpeg.subarray(0, 3)], [0xff, 0xd8, 0xff]);
  assert.equal(detectFormat(jpeg), "jpeg");
});

test("webp output is refused rather than silently written as something else", async () => {
  const image = await render(solid({ width: 8, height: 8 }));

  await assert.rejects(() => encode(image, "webp"), /unknown output format/);
  assert.throws(() => formatForPath("dist/out.webp"), /expected \.png, \.jpg or \.jpeg/);
});

test("resize keeps the aspect ratio when given one dimension", async () => {
  const image = await render(resize(solid({ width: 200, height: 100 }), { width: 50 }));

  assert.equal(image.width, 50);
  assert.equal(image.height, 25);
});

test("resize cover fills the frame exactly", async () => {
  const image = await render(resize(solid({ width: 200, height: 100 }), { width: 80, height: 80, fit: "cover" }));

  assert.equal(image.width, 80);
  assert.equal(image.height, 80);
});

test("downscaling averages rather than dropping pixels", async () => {
  // a 2x1 image of black and white must average to grey, not pick a side
  const image = createImage(2, 1);

  image.data.set([0, 0, 0, 255, 255, 255, 255, 255]);

  const shrunk = await render(resize(wrap(image), { width: 1, height: 1 }));

  assert.equal(shrunk.data[0], 127);
});

// tiny helper so a literal image can be dropped into a graph

function wrap(image) {
  const node = defineEffect(`test:wrap:${wrapCount++}`, {
    inputs: 0,
    params: {},
    apply: () => image,
  });

  return node();
}

let wrapCount = 0;

test("blend composites alpha rather than overwriting it", async () => {
  const backdrop = solid({ width: 4, height: 4, color: "#000000ff" });
  const overlay = solid({ width: 4, height: 4, color: "#ffffff80" });

  const image = await render(blend({ a: backdrop, b: overlay }, { mode: "normal" }));

  // white at 50% over black is mid grey, and the result stays opaque
  assert.ok(Math.abs(image.data[0] - 128) <= 2, `expected ~128, got ${image.data[0]}`);
  assert.equal(image.data[3], 255);
});

test("blend multiply darkens", async () => {
  const a = solid({ width: 2, height: 2, color: "#808080" });
  const b = solid({ width: 2, height: 2, color: "#808080" });

  const image = await render(blend({ a, b }, { mode: "multiply" }));

  assert.ok(image.data[0] < 80, `multiply should darken, got ${image.data[0]}`);
});

test("blend leaves the backdrop alone outside the overlay", async () => {
  const backdrop = solid({ width: 8, height: 8, color: "#ff0000" });
  const overlay = solid({ width: 2, height: 2, color: "#0000ff" });

  const image = await render(blend({ a: backdrop, b: overlay }, { x: 4, y: 4 }));

  assert.deepEqual([...image.data.subarray(0, 4)], [255, 0, 0, 255]);

  const moved = (5 * 8 + 5) * 4;

  assert.deepEqual([...image.data.subarray(moved, moved + 4)], [0, 0, 255, 255]);
});

test("blend rejects an unknown mode", async () => {
  const a = solid({ width: 2, height: 2 });

  await assert.rejects(() => render(blend({ a, b: a }, { mode: "nope" })), /unknown blend mode/);
});

test("flatten drops alpha onto the background", async () => {
  const image = await render(flatten(solid({ width: 2, height: 2, color: "#00000000" }), { background: "#ff0000" }));

  assert.deepEqual([...image.data.subarray(0, 4)], [255, 0, 0, 255]);
});

test("jpeg output is flattened, not left to guess", async () => {
  const transparent = solid({ width: 8, height: 8, color: "#00000000" });
  const seen = [];

  await toBuffer(transparent, {
    format: "jpeg",
    background: "#ff0000",
    quality: 90,
    onNode: ({ node, image }) => seen.push({ type: node.type, image }),
  });

  const flattened = seen.find((entry) => entry.type === "flatten");

  assert.ok(flattened, "no flatten node was inserted ahead of the jpeg encoder");
  assert.deepEqual([...flattened.image.data.subarray(0, 4)], [255, 0, 0, 255]);
});

test("png output keeps its alpha", async () => {
  const transparent = solid({ width: 8, height: 8, color: "#00000000" });
  const decoded = await decode(await toBuffer(transparent, { format: "png" }));

  assert.equal(decoded.data[3], 0);
});

test("graphs round trip through json, sharing intact", async () => {
  const shared = solid({ width: 8, height: 8, color: "#224466" });
  const original = blend({ a: shared, b: blur(shared, { radius: 2 }) }, { mode: "screen" });

  const spec = toJSON(original);

  // the shared node is written once and referenced twice
  assert.equal(spec.nodes.filter((entry) => entry.type === "solid").length, 1);

  const rebuilt = fromJSON(spec);

  assert.deepEqual((await render(rebuilt)).data, (await render(original)).data);
  assert.equal(describe(rebuilt), describe(original));
});

test("json survives a stringify", () => {
  const node = duotone(solid({ width: 4, height: 4 }), { shadow: "#112233" });
  const spec = JSON.parse(JSON.stringify(toJSON(node)));

  assert.equal(describe(fromJSON(spec)), describe(node));
});

test("effects reject parameters they do not have", () => {
  assert.throws(() => blur(solid({ width: 2, height: 2 }), { radiuss: 4 }), /has no parameter/);
});

test("effects say which input is missing", () => {
  assert.throws(() => blend({ a: solid({ width: 2, height: 2 }) }, {}), /needs a node for input "b", got nothing/);
});

test("effects check their input count", () => {
  const node = solid({ width: 2, height: 2 });

  assert.throws(() => blend([node], {}), /takes 2 input\(s\), got 1/);
});

test("cycles are reported rather than hanging", async () => {
  const node = blur(solid({ width: 4, height: 4 }), { radius: 1 });

  // only reachable by hand-building a node, but it should not recurse forever
  node.inputs[0] = { ...node, inputs: [node] };

  await assert.rejects(() => render(node), /cycle/);
});

test("grain is deterministic across runs", async () => {
  const make = () => grain(solid({ width: 16, height: 16, color: "#808080" }), { amount: 0.5, seed: 7 });

  assert.deepEqual((await render(make())).data, (await render(make())).data);
});

test("grain actually varies with the seed", async () => {
  const base = solid({ width: 16, height: 16, color: "#808080" });

  const one = await render(grain(base, { amount: 0.5, seed: 1 }));
  const two = await render(grain(base, { amount: 0.5, seed: 2 }));

  assert.notDeepEqual(one.data, two.data);
});

test("effects do not mutate their input", async () => {
  const base = solid({ width: 8, height: 8, color: "#3a7bd5" });
  const cache = new Map();

  const before = Buffer.from((await render(base, { cache })).data);

  await render(blur(base, { radius: 2 }), { cache });
  await render(duotone(base, { shadow: "#000000", highlight: "#ff0000" }), { cache });

  assert.deepEqual((await render(base, { cache })).data, before);
});
