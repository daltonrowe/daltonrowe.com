# vendored codec

Checked in on purpose. Nothing here is installed from npm at build time, and
nothing here has been edited — the files are byte-for-byte what the upstream
package ships, so refreshing them is a copy.

| file | from | bytes |
| --- | --- | --- |
| `mozjpeg_enc.js` / `.wasm` | `@jsquash/jpeg@1.6.0` `codec/enc/` | 251,524 |

About 290 KB in total. That is the whole binary footprint of the image system.

## what is deliberately absent

**PNG**, because `../png.js` does it in ~250 lines on `node:zlib`. Deflate plus
five scanline filters is less code than any codec that could be vendored for
the job.

**Every decoder except PNG.** This build reads PNG only. The JPEG and WebP
decoders came to ~300 KB of wasm to read formats that only appear as sources,
and the effects pipeline works from PNG masters. `../index.js` still sniffs
JPEG and WebP headers so feeding one in reports what is wrong rather than
"unrecognised image".

**WebP encode**, which was the single largest file at 346 KB.

If you need any of them back, they are one `npm pack` away:

```sh
npm pack @jsquash/jpeg @jsquash/webp
# extract, then copy codec/{dec,enc}/* and codec/LICENSE.codec.md into here
```

then add a loader beside `loadJPEGEncoder` in `../wasm.js` and a branch in
`../index.js`. Nothing above the codec layer needs to change — the graph and
the effects only ever see RGBA.

## how it loads under node

The glue file is an ES module that default-exports an Emscripten factory.
`../wasm.js` hands it a `WebAssembly.Module` compiled from disk via
`instantiateWasm`, which is what stops the glue trying to `fetch` its own
`.wasm` over HTTP — the reason it runs unmodified under Node at all.

`mozjpeg_enc` is a non-SIMD build, so there is no feature detection to do.

## licenses

- `LICENSE.jsquash.txt` — Apache 2.0, the jSquash wrapper and codec build
- `LICENSE.mozjpeg.md` — libjpeg-turbo / mozjpeg, BSD-style

Both permit redistribution in source and binary form with the notices kept,
which is what checking these files in does.
