// node --test
//
// ingest depends on sharp, which is a devDependency. these skip rather than
// fail when the repo is checked out without running npm install, so the
// zero-dependency half of the project still tests on its own.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";

import { decode } from "../lib/image/index.js";

const root = path.join(import.meta.dirname, "..");
const script = path.join(root, "scripts", "ingest.js");

const hasSharp = await import("sharp").then(
  () => true,
  () => false,
);

const options = { skip: hasSharp ? false : "sharp not installed (npm install)" };

function run(args) {
  return execFileSync(process.execPath, [script, ...args], { encoding: "utf-8" });
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ingest-"));
}

// a source with a known orientation tag, built rather than committed
//
// 4 wide by 2 tall, tagged orientation 6 ("rotate 90"), so a correct ingest
// has to come back 2 wide by 4 tall

async function orientedJPEG(orientation, width = 4, height = 2) {
  const { default: sharp } = await import("sharp");

  return sharp({
    create: { width, height, channels: 3, background: "#c03030" },
  })
    .withMetadata({ orientation })
    .jpeg()
    .toBuffer();
}

// output is jpeg by default, which lib/image deliberately cannot read, so
// dimensions are checked through sharp

async function dims(file) {
  const { default: sharp } = await import("sharp");
  const { width, height, format } = await sharp(file).metadata();

  return { width, height, format };
}

test("writes jpg by default", options, async () => {
  const dir = tempDir();
  const file = path.join(dir, "photo.jpg");

  fs.writeFileSync(file, await orientedJPEG(1));
  run([file, "--out", path.join(dir, "out")]);

  assert.equal((await dims(path.join(dir, "out", "photo.jpg"))).format, "jpeg");
});

test("bakes exif orientation into the output", options, async () => {
  const dir = tempDir();
  const file = path.join(dir, "rotated.jpg");

  fs.writeFileSync(file, await orientedJPEG(6));
  run([file, "--out", path.join(dir, "out")]);

  // the tag says rotate 90, so a 4x2 source has to come back 2x4
  const out = await dims(path.join(dir, "out", "rotated.jpg"));

  assert.equal(out.width, 2);
  assert.equal(out.height, 4);
});

test("leaves an upright photo alone", options, async () => {
  const dir = tempDir();
  const file = path.join(dir, "upright.jpg");

  fs.writeFileSync(file, await orientedJPEG(1));
  run([file, "--out", path.join(dir, "out")]);

  const out = await dims(path.join(dir, "out", "upright.jpg"));

  assert.equal(out.width, 4);
  assert.equal(out.height, 2);
});

test("caps the longest edge at 1280 whichever way round the photo is", options, async () => {
  const dir = tempDir();

  for (const [name, w, h, expected] of [
    ["landscape", 3000, 2000, { width: 1280, height: 853 }],
    ["portrait", 2000, 3000, { width: 853, height: 1280 }],
  ]) {
    const file = path.join(dir, `${name}.jpg`);

    fs.writeFileSync(file, await orientedJPEG(1, w, h));
    run([file, "--out", path.join(dir, "out")]);

    const out = await dims(path.join(dir, "out", `${name}.jpg`));

    assert.deepEqual({ width: out.width, height: out.height }, expected, name);
  }
});

test("does not enlarge a source smaller than the limit", options, async () => {
  const dir = tempDir();
  const file = path.join(dir, "small.jpg");

  fs.writeFileSync(file, await orientedJPEG(1));
  run([file, "--out", path.join(dir, "out")]);

  assert.equal((await dims(path.join(dir, "out", "small.jpg"))).width, 4);
});

test("--format png writes something lib/image can read", options, async () => {
  const dir = tempDir();
  const file = path.join(dir, "photo.jpg");

  fs.writeFileSync(file, await orientedJPEG(1));
  run([file, "--out", path.join(dir, "out"), "--format", "png"]);

  const image = await decode(fs.readFileSync(path.join(dir, "out", "photo.png")));

  assert.equal(image.width, 4);
  assert.equal(image.data.length, image.width * image.height * 4);
});

test("rejects a nonsense --width", options, () => {
  assert.throws(() => run(["photo.jpg", "--width", "wide"]), /--width must be a positive number/);
});

test("option values are not mistaken for input files", options, async () => {
  const dir = tempDir();
  const file = path.join(dir, "photo.jpg");

  fs.writeFileSync(file, await orientedJPEG(1));

  // --out's value is a directory; treating it as an input used to throw EISDIR
  const output = run([file, "--out", path.join(dir, "out"), "--width", "64"]);

  assert.equal(output.trim().split("\n").length, 1);
});

test("drops metadata, including any gps the phone recorded", options, async () => {
  const { default: sharp } = await import("sharp");
  const dir = tempDir();
  const file = path.join(dir, "located.jpg");

  fs.writeFileSync(file, await orientedJPEG(1));
  run([file, "--out", path.join(dir, "out")]);

  const meta = await sharp(path.join(dir, "out", "located.jpg")).metadata();

  assert.equal(meta.exif, undefined);
});

test("refuses to overwrite the source", options, async () => {
  const dir = tempDir();
  const file = path.join(dir, "photo.jpg");

  fs.writeFileSync(file, await orientedJPEG(1));

  // jpg in, jpg out, no --out: the target resolves to the source itself
  assert.throws(() => run([file]), /would overwrite the source/);
  assert.deepEqual(fs.readFileSync(file), await orientedJPEG(1));
});

test("refuses an unknown format", options, () => {
  assert.throws(() => run(["whatever.jpg", "--format", "gif"]), /expected png or jpg/);
});

test("asks for a value when an option is missing one", options, () => {
  assert.throws(() => run(["photo.jpg", "--width"]), /--width needs a value/);
});
