// turn phone photos into masters the effects pipeline can read
//
//   node scripts/ingest.js ~/Downloads/IMG_2059.heic
//   node scripts/ingest.js photos/*.heic --out articles/trip --width 1600
//   node scripts/ingest.js photo.heic --format png     # readable by lib/image
//
// this is the one part of the repo with dependencies, and they are dev only.
// it runs when you add photos, not when the site builds — lib/image stays
// dependency free and reads the png masters this writes.
//
// what it handles that a plain convert does not:
//
//   exif orientation   phone photos are stored sideways with a tag saying
//                      which way is up. png has no such tag, so the rotation
//                      has to be baked in here or it is lost for good.
//   display p3         iphones shoot wide gamut. left alone, the colours
//                      shift once the file is treated as srgb.
//   heic               sharp's prebuilt libvips reads the container but
//                      cannot decode hevc, so those go through heic-decode.
//   metadata           dropped, which includes the gps coordinates phone
//                      photos carry. sharp strips by default; we never ask
//                      for it back.

import * as fs from "node:fs";
import * as path from "node:path";

const args = process.argv.slice(2);

// options that take a value, so the value is not mistaken for an input file
const VALUED = new Set(["--out", "--width", "--format", "--quality"]);

const files = [];
const options = new Map();

for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  if (!arg.startsWith("--")) {
    files.push(arg);
  } else if (VALUED.has(arg)) {
    if (i + 1 >= args.length) {
      console.error(`${arg} needs a value`);
      process.exit(1);
    }

    options.set(arg.slice(2), args[++i]);
  } else {
    options.set(arg.slice(2), true);
  }
}

function flag(name, fallback) {
  return options.has(name) ? options.get(name) : fallback;
}

if (!files.length || options.has("help")) {
  console.error(
    [
      "usage: node scripts/ingest.js <photo...> [options]",
      "",
      "  --out <dir>       where to write (default: alongside the source)",
      "  --width <px>      longest edge, never enlarges (default: 1280)",
      "  --format <fmt>    jpg or png (default: jpg; lib/image reads png)",
      "  --quality <n>     jpg quality (default: 90)",
    ].join("\n"),
  );
  process.exit(files.length ? 0 : 1);
}

const outDir = flag("out", null);
const maxWidth = Number(flag("width", 1280));
const format = flag("format", "jpg");
const quality = Number(flag("quality", 90));

if (format !== "png" && format !== "jpg") {
  console.error(`unknown --format ${JSON.stringify(format)}, expected png or jpg`);
  process.exit(1);
}

if (!Number.isFinite(maxWidth) || maxWidth < 1) {
  console.error(`--width must be a positive number, got ${JSON.stringify(flag("width", ""))}`);
  process.exit(1);
}

// sharp is a devDependency, so say so plainly rather than throwing a resolver
// error at someone who cloned the repo to read it

let sharp;

try {
  ({ default: sharp } = await import("sharp"));
} catch {
  console.error("ingest needs its dev dependencies: npm install");
  process.exit(1);
}

// heic magic: an iso base media file whose ftyp brand is one of these

const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

function isHEIC(buffer) {
  if (buffer.length < 12 || buffer.toString("ascii", 4, 8) !== "ftyp") return false;

  return HEIC_BRANDS.has(buffer.toString("ascii", 8, 12));
}

// exif orientation as sharp operations
//
// sharp's .rotate() with no argument reads the tag off the input, which only
// works when sharp did the decoding. the heic path arrives as bare pixels, so
// the transform has to be applied by hand.

const ORIENTATION = {
  1: (pipe) => pipe,
  2: (pipe) => pipe.flop(),
  3: (pipe) => pipe.rotate(180),
  4: (pipe) => pipe.flip(),
  5: (pipe) => pipe.rotate(90).flop(),
  6: (pipe) => pipe.rotate(90),
  7: (pipe) => pipe.rotate(270).flop(),
  8: (pipe) => pipe.rotate(270),
};

async function openHEIC(buffer) {
  let decode;

  try {
    ({ default: decode } = await import("heic-decode"));
  } catch {
    throw new Error("heic needs its dev dependencies: npm install");
  }

  const { width, height, data } = await decode({ buffer });

  // sharp still parses the heic container even though it cannot decode the
  // pixels, so the orientation tag is readable from it
  let orientation = 1;

  try {
    orientation = (await sharp(buffer).metadata()).orientation ?? 1;
  } catch {
    // no readable metadata, assume upright
  }

  const pipe = sharp(Buffer.from(data), {
    raw: { width, height, channels: 4 },
  });

  return (ORIENTATION[orientation] ?? ORIENTATION[1])(pipe);
}

async function open(file) {
  const buffer = fs.readFileSync(file);

  // .rotate() bakes in the exif orientation for everything sharp decodes
  return isHEIC(buffer) ? openHEIC(buffer) : sharp(buffer).rotate();
}

async function ingest(file) {
  const pipe = await open(file);
  const before = await sharp(fs.readFileSync(file))
    .metadata()
    .catch(() => ({}));

  let out = pipe
    // wide gamut sources shift if they are read as srgb later
    .toColorspace("srgb")
    // a square bound with fit "inside" caps the longest edge whichever way
    // round the photo is, and never scales a small source up
    .resize({ width: maxWidth, height: maxWidth, fit: "inside", withoutEnlargement: true });

  out = format === "png" ? out.png({ compressionLevel: 9 }) : out.jpeg({ quality, mozjpeg: true });

  const { data, info } = await out.toBuffer({ resolveWithObject: true });

  const target = path.join(
    outDir ?? path.dirname(file),
    `${path.basename(file, path.extname(file))}.${format}`,
  );

  // ingesting a jpg as jpg with no --out lands on the source itself, which
  // would replace the original with a downscaled copy
  if (path.resolve(target) === path.resolve(file)) {
    throw new Error("that would overwrite the source, pass --out <dir>");
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, data);

  return {
    target,
    from: `${before.width ?? "?"}x${before.height ?? "?"} ${before.format ?? "?"}`,
    to: `${info.width}x${info.height}`,
    bytes: data.length,
    sourceBytes: fs.statSync(file).size,
  };
}

let failed = 0;

for (const file of files) {
  try {
    const r = await ingest(file);

    console.log(
      `${r.target}  ${r.from} -> ${r.to}  ` +
        `${(r.sourceBytes / 1024 / 1024).toFixed(1)}MB -> ${(r.bytes / 1024 / 1024).toFixed(1)}MB`,
    );
  } catch (error) {
    console.error(`${file}: ${error.message}`);
    failed++;
  }
}

if (failed) process.exit(1);
