# image effects

Composable image effects for the build, with no npm dependencies. Reads PNG,
writes PNG and JPEG. PNG is pure JS on `node:zlib`; JPEG output goes through a
vendored mozjpeg wasm build in `codecs/vendor/` — see the README there for what
is in it, what was left out, and how to add a format back.

```sh
npm run fx graphs/example.js        # render
npm run fx graphs/example.js --dry  # print the graphs, render nothing
node scripts/fx.js --effects        # list effects and their parameters
npm test                            # run the suite
```

## graphs

Calling an effect does not touch pixels. It returns a node — a description of
an operation and what feeds it. Work happens when `write()` or `render()` asks
for a result.

```js
import { source, blur, duotone, write } from "./lib/image/index.js";

const photo = source({ file: "articles/mouth/mouth.png" });
const look = duotone(blur(photo, { radius: 6 }), { shadow: "#140a3c" });

await write(look, "dist/mouth.jpg", { quality: 82 });
```

That matters once a graph branches. A node feeding two consumers is evaluated
once, so recombining a branch with its own source costs nothing extra:

```js
const small = resize(photo, { width: 800 });

// small is decoded and resized once, not twice
const bloom = blend({ a: small, b: blur(small, { radius: 10 }) }, {
  mode: "screen",
  opacity: 0.55,
});
```

Pass a `cache` to reuse decoded sources across several `write()` calls —
`scripts/fx.js` does this for every entry in a graph file.

## graph files

A graph file default-exports one `{ node, file, options }` or an array of them.
`options` goes to the encoder; the format comes from the extension.

```js
export default [
  { node: thumbnail, file: "dist/fx/thumb.jpg", options: { quality: 82 } },
  { node: treated, file: "dist/fx/treated.png" },
];
```

Graphs are also data. `toJSON()` and `fromJSON()` round trip one through plain
JSON, keeping shared nodes shared, which is what a GUI would sit on if there
ever is one.

## effects

`source` `solid` `gradient` — generators, no inputs
`resize` `crop` `flip` — geometry
`grayscale` `invert` `adjust` `levels` `duotone` `tint` `threshold` `posterize` `opacity` — colour
`blur` `sharpen` `vignette` `grain` `dither` `channelShift` — neighbourhood filters
`blend` `mask` — two inputs
`flatten` — drop alpha onto a background

`node scripts/fx.js --effects` prints every parameter and its default.

## writing an effect

```js
import { defineEffect } from "../graph.js";
import { likeImage } from "../image.js";

export const redshift = defineEffect("redshift", {
  params: { amount: 0.2 },
  apply([image], { amount }) {
    const out = likeImage(image);

    for (let i = 0; i < image.data.length; i += 4) {
      out.data[i] = Math.min(255, image.data[i] * (1 + amount));
      out.data[i + 1] = image.data[i + 1];
      out.data[i + 2] = image.data[i + 2];
      out.data[i + 3] = image.data[i + 3];
    }

    return out;
  },
});
```

Two rules. `apply` must not mutate anything in `inputs` — a node's output may
be read by several consumers, and one of them scribbling on it corrupts the
others. And it must be deterministic, or the build produces a different file
every run and churns the diff; `grain` takes a seed rather than calling
`Math.random` for exactly this reason.

Export it from `effects/index.js` and it shows up in `--effects`.

## notes

Images are straight (not premultiplied) 8-bit RGBA, tightly packed, always
`width * height * 4` bytes. Every codec decodes to this and encodes from it, so
effects never learn what a JPEG is.

JPEG has no alpha channel, so `write()` inserts `flatten` for JPEG output
rather than letting the encoder read whatever sits under transparent pixels.
Override the colour with `background`.

PNG input must be 8-bit and non-interlaced. Both are what tools emit by
default; anything else throws with a message saying to re-save.

Sources must be PNG. Handing `source` a JPEG or WebP names the format and says
so rather than failing vaguely — run it through `scripts/ingest.js --format
png` (below), or vendor the decoder back in per `codecs/vendor/README.md`.

## getting photos in

`scripts/ingest.js` turns phone photos into web-sized images. It is the only
part of the repo with dependencies, and they are dev only — it runs when you
add photos, not when the site builds.

```sh
npm install                                  # once, for sharp
node scripts/ingest.js ~/Downloads/IMG_2059.heic
node scripts/ingest.js photos/*.heic --out articles/trip --width 1600
node scripts/ingest.js photo.heic --format png   # to feed the effects graph
```

Defaults are **jpg** at **1280** on the longest edge, which is a finished
web asset rather than a master — small enough to commit, already the right
size to publish.

Note that jpg output is not readable by `source` above, by design: this build
decodes PNG only. Photos you want to run effects over need `--format png`,
which costs about 20x the bytes on disk. Two shapes that work:

- ingest straight to jpg, and only re-ingest as png the few photos an effect
  graph actually consumes
- vendor `mozjpeg_dec` back (166 KB, see `codecs/vendor/README.md`) so `source`
  reads jpg directly, and keep one ingested file per photo

It handles four things that a plain convert gets wrong:

**EXIF orientation.** Phone photos are stored sideways with a tag saying which
way is up. PNG has no such tag, so the rotation is baked into the pixels here
or it is lost for good. This is the one that bites silently — the image just
comes out rotated.

**Display P3.** iPhones shoot wide gamut; left alone the colours shift once the
file is treated as sRGB.

**HEIC.** What iPhones actually shoot. sharp's prebuilt libvips reads the
container but cannot decode HEVC, so those route through `heic-decode`.

**Metadata**, dropped — which includes the GPS coordinates phone photos carry.

Without `npm install` the script says so and exits; the rest of the project,
including `npm test` and `npm run fx`, does not need it.
