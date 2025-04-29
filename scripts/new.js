import * as fs from "node:fs";
import * as path from "node:path";

const [, , type] = process.argv;

let content;
let distDir;
let distFile;

if (type === "link") {
  const [, , , url, description, quote] = process.argv;

  const data = {
    url: url ?? "",
    description: description ?? "",
    quote: quote ?? "",
  };

  content = JSON.stringify(data, null, 2);

  distDir = "links";
  distFile = "json";
}

if (type === "thought") {
  const [, , , thought] = process.argv;

  let lines;

  if (thought.indexOf("\\n") !== -1) {
    lines = thought.split("\\n");
  } else {
    lines = [thought];
  }

  content = lines.map(line => `<p>${line}</p>`).join('\n\n')

  distDir = "thoughts";
  distFile = "html";
}

const distPath = path.join(import.meta.dirname, "..", distDir);
const previous = fs.readdirSync(distPath).map((f) => f.split(".")[0]);

const today = new Date();
const filename = today.toISOString().split("T")[0];

let offset = "";

const dupes = previous.filter((f) => f.includes(filename));

if (dupes.length) {
  const last = dupes.at(-1);

  if (last.includes("_")) {
    offset = `_${Number.parseInt(last.split("_")[1]) + 1}`;
  } else {
    offset = "_1";
  }
}

const next = path.join(distPath, `${filename + offset}.${distFile}`);
fs.writeFileSync(next, `${content}\n`);
