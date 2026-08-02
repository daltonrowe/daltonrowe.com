// run image graphs
//
//   node scripts/fx.js graphs/example.js         render every output
//   node scripts/fx.js graphs/example.js --dry   print the graphs, render nothing
//   node scripts/fx.js --effects                 list effects and their params
//
// a graph file default-exports either one { node, file, options } entry or
// an array of them.

import * as path from "node:path";

import { describe, listEffects } from "../lib/image/index.js";
import { write } from "../lib/image/index.js";

const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith("--")));
const files = args.filter((arg) => !arg.startsWith("--"));

if (flags.has("--effects")) {
  await import("../lib/image/effects/index.js");

  for (const effect of listEffects()) {
    const params = Object.entries(effect.params)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join(" ");

    console.log(`${effect.type}  (${effect.inputs} in)${params ? `\n  ${params}` : ""}`);
  }

  process.exit(0);
}

if (!files.length) {
  console.error("usage: node scripts/fx.js <graph.js> [--dry]");
  process.exit(1);
}

const dry = flags.has("--dry");
const verbose = flags.has("--verbose");

for (const file of files) {
  const resolved = path.resolve(file);
  const module = await import(resolved);
  const entries = [module.default].flat().filter(Boolean);

  if (!entries.length) {
    console.error(`${file} default-exports nothing to render`);
    process.exit(1);
  }

  // one cache across the whole file, so graphs sharing a source decode once
  const cache = new Map();

  for (const entry of entries) {
    if (!entry.node || !entry.file) {
      console.error(`${file} exported an entry without a node and a file`);
      process.exit(1);
    }

    if (dry) {
      console.log(`${entry.file}\n${describe(entry.node).replace(/^/gm, "  ")}\n`);
      continue;
    }

    const started = performance.now();

    const onNode = verbose
      ? ({ node, elapsed }) => console.log(`  ${node.type} ${elapsed.toFixed(0)}ms`)
      : undefined;

    const result = await write(entry.node, entry.file, { ...entry.options, cache, onNode });
    const elapsed = performance.now() - started;

    console.log(
      `${result.file}  ${(result.bytes / 1024).toFixed(1)}kb  ${elapsed.toFixed(0)}ms`,
    );
  }
}
