import * as fs from "node:fs";
import * as path from "node:path";

const linkPath = path.join(import.meta.dirname, "..", "links");
const links = fs.readdirSync(linkPath).map((f) => f.split(".")[0]);

const today = new Date();
const filename = today.toISOString().split("T")[0];

let offset = "";

const dupes = links.filter((f) => f.includes(filename));

if (dupes.length) {
  const last = dupes.at(-1);
  offset = `_${Number.parseInt(last.split("_")[1]) + 1}`;
}

const linkContent = {
  url: "",
  description: "",
  quote: "",
};

const newLink = path.join(linkPath, `${filename + offset}.json`);
fs.writeFileSync(newLink, `${JSON.stringify(linkContent, null, 2)}\n`);
