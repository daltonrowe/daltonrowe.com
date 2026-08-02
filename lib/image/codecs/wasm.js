// loader for the vendored jpeg encoder
//
// the emscripten glue in vendor/ normally wants to fetch its own .wasm over
// http, which it cannot do here. handing it a WebAssembly.Module we compiled
// from disk skips that path entirely, which is also what lets the vendored
// files stay unmodified and dependency-free.

import * as fs from "node:fs";
import * as path from "node:path";

const vendorPath = path.join(import.meta.dirname, "vendor");

// compiled and instantiated at most once, on first use, so a graph that only
// writes png never pays for it

let pending;

export function loadJPEGEncoder() {
  if (!pending) {
    pending = instantiate("mozjpeg_enc.js", "mozjpeg_enc.wasm").catch((error) => {
      // let a later call retry rather than caching the failure forever
      pending = undefined;
      throw error;
    });
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
