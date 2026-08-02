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

async function orientedJPEG(orientation) {
  const { default: sharp } = await import("sharp");

  return sharp({
    create: { width: 4, height: 2, channels: 3, background: "#c03030" },
  })
    .withMetadata({ orientation })
    .jpeg()
    .toBuffer();
}

test("bakes exif orientation into the output", options, async () => {
  const dir = tempDir();
  const file = path.join(dir, "rotated.jpg");

  fs.writeFileSync(file, await orientedJPEG(6));
  run([file, "--out", dir]);

  const image = await decode(fs.readFileSync(path.join(dir, "rotated.png")));

  // png cannot carry the tag, so the pixels themselves must be rotated
  assert.equal(image.width, 2);
  assert.equal(image.height, 4);
});

test("leaves an upright photo alone", options, async () => {
  const dir = tempDir();
  const file = path.join(dir, "upright.jpg");

  fs.writeFileSync(file, await orientedJPEG(1));
  run([file, "--out", dir]);

  const image = await decode(fs.readFileSync(path.join(dir, "upright.png")));

  assert.equal(image.width, 4);
  assert.equal(image.height, 2);
});

test("writes png that lib/image can actually read", options, async () => {
  const dir = tempDir();
  const file = path.join(dir, "photo.jpg");

  fs.writeFileSync(file, await orientedJPEG(1));
  run([file, "--out", dir]);

  const image = await decode(fs.readFileSync(path.join(dir, "photo.png")));

  assert.equal(image.data.length, image.width * image.height * 4);
});

test("does not enlarge a source smaller than --width", options, async () => {
  const dir = tempDir();
  const file = path.join(dir, "small.jpg");

  fs.writeFileSync(file, await orientedJPEG(1));
  run([file, "--out", dir, "--width", "2000"]);

  const image = await decode(fs.readFileSync(path.join(dir, "small.png")));

  assert.equal(image.width, 4);
});

test("option values are not mistaken for input files", options, async () => {
  const dir = tempDir();
  const file = path.join(dir, "photo.jpg");

  fs.writeFileSync(file, await orientedJPEG(1));

  // --out's value is a directory; treating it as an input used to throw EISDIR
  const output = run([file, "--out", dir, "--width", "64"]);

  assert.equal(output.trim().split("\n").length, 1);
});

test("drops metadata, including any gps the phone recorded", options, async () => {
  const { default: sharp } = await import("sharp");
  const dir = tempDir();
  const file = path.join(dir, "located.jpg");

  fs.writeFileSync(file, await orientedJPEG(1));
  run([file, "--out", dir, "--format", "jpg"]);

  const meta = await sharp(path.join(dir, "located.jpg")).metadata();

  assert.equal(meta.exif, undefined);
});

test("refuses an unknown format", options, () => {
  assert.throws(() => run(["whatever.jpg", "--format", "gif"]), /expected png or jpg/);
});

test("asks for a value when an option is missing one", options, () => {
  assert.throws(() => run(["photo.jpg", "--width"]), /--width needs a value/);
});
