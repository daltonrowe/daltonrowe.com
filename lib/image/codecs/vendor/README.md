# vendored codecs

Checked in on purpose. Nothing here is installed from npm at build time, and
nothing here has been edited — the files are byte-for-byte what the upstream
packages ship, so refreshing them is a copy.

| file | from | bytes |
| --- | --- | --- |
| `mozjpeg_dec.js` / `.wasm` | `@jsquash/jpeg@1.6.0` `codec/dec/` | 166,470 |
| `mozjpeg_enc.js` / `.wasm` | `@jsquash/jpeg@1.6.0` `codec/enc/` | 251,524 |
| `webp_dec.js` / `.wasm` | `@jsquash/webp@1.5.0` `codec/dec/` | 137,960 |
| `webp_enc_simd.js` / `.wasm` | `@jsquash/webp@1.5.0` `codec/enc/` | 345,584 |

About 1.1 MB in total, of which ~900 KB is wasm.

PNG is deliberately absent: `../png.js` does it in ~250 lines on `node:zlib`,
which is smaller than any codec that could be vendored for the job.

## refreshing

```sh
npm pack @jsquash/jpeg @jsquash/webp
# extract, then copy codec/{dec,enc}/* and codec/LICENSE.codec.md into here
```

The glue files are ES modules that default-export an Emscripten factory.
`../wasm.js` hands each one a `WebAssembly.Module` compiled from disk via
`instantiateWasm`, which is what stops the glue trying to `fetch` its own
`.wasm` over HTTP — the reason these run unmodified under Node at all.

## simd

Only the SIMD build of the WebP encoder is vendored. Every V8 since Node 16.4
has wasm SIMD on by default, so the ~280 KB fallback build would be bytes that
never execute. `wasm.js` checks for SIMD support and explains what to vendor if
a runtime ever reports it missing. The JPEG codecs and the WebP decoder are
non-SIMD builds and need no such check.

## licenses

- `LICENSE.jsquash.txt` — Apache 2.0, the jSquash wrappers and codec builds
- `LICENSE.mozjpeg.md` — libjpeg-turbo / mozjpeg, BSD-style
- `LICENSE.libwebp.md` — libwebp, BSD 3-clause

All three permit redistribution in source and binary form with the notices
kept, which is what checking these files in does.
