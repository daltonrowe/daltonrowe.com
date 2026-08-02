// loader for the vendored wasm codecs
//
// the emscripten glue in vendor/ normally wants to fetch its own .wasm over
// http, which it cannot do here. handing it a WebAssembly.Module we compiled
// from disk skips that path entirely, which is also what lets the vendored
// files stay unmodified and dependency-free.

import * as fs from "node:fs";
import * as path from "node:path";

const vendorPath = path.join(import.meta.dirname, "vendor");

// wasm-feature-detect's simd() check, inlined: a module using v128 ops only
// validates on an engine that implements simd.

const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8,
  0, 65, 0, 253, 15, 253, 98, 11,
]);

export const hasSIMD = WebAssembly.validate(SIMD_PROBE);

// each codec is compiled and instantiated at most once, on first use, so a
// graph that only touches png never pays for the jpeg and webp modules

const loaded = new Map();

function load(name, loader) {
  let pending = loaded.get(name);

  if (!pending) {
    pending = loader().catch((error) => {
      // let a later call retry rather than caching the failure forever
      loaded.delete(name);
      throw error;
    });

    loaded.set(name, pending);
  }

  return pending;
}

async function instantiate(glueFile, wasmFile) {
  const { default: factory } = await import(path.join(vendorPath, glueFile));
  const wasmModule = new WebAssembly.Module(fs.readFileSync(path.join(vendorPath, wasmFile)));

  return factory({
    noInitialRun: true,
    instantiateWasm(imports, callback) {
      const instance = new WebAssembly.Instance(wasmModule, imports);
      callback(instance);
      return instance.exports;
    },
  });
}

export function loadJPEGDecoder() {
  return load("jpeg-dec", () => instantiate("mozjpeg_dec.js", "mozjpeg_dec.wasm"));
}

export function loadJPEGEncoder() {
  return load("jpeg-enc", () => instantiate("mozjpeg_enc.js", "mozjpeg_enc.wasm"));
}

export function loadWebPDecoder() {
  return load("webp-dec", () => instantiate("webp_dec.js", "webp_dec.wasm"));
}

export function loadWebPEncoder() {
  return load("webp-enc", () => {
    // only the simd build is vendored; every v8 since node 16.4 has simd on,
    // so the fallback build would be ~280kb of bytes that never execute
    if (!hasSIMD) {
      throw new Error(
        "webp encoding needs wasm simd, which this runtime does not report. " +
          "vendor webp_enc.js/.wasm from @jsquash/webp for a non-simd fallback.",
      );
    }

    return instantiate("webp_enc_simd.js", "webp_enc_simd.wasm");
  });
}
