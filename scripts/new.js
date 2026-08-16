import * as fs from "node:fs";
import * as path from "node:path";

const [, , type] = process.argv;

const root = path.join(import.meta.dirname, "..");

// links are one dated json per entry, so the filename is derived from today
// with an _N suffix when there's already an entry for the day

function nextDatedPath(distPath, extension) {
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

  return path.join(distPath, `${filename + offset}.${extension}`);
}

// "canvas-crusher" -> "Canvas Crusher", so a slug alone is enough to start

function titleFromSlug(slug) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

if (type === "link") {
  const [, , , url, description, quote] = process.argv;

  const data = {
    url: url ?? "",
    description: description ?? "",
    quote: quote ?? "",
  };

  const next = nextDatedPath(path.join(root, "links"), "json");
  fs.writeFileSync(next, `${JSON.stringify(data, null, 2)}\n`);

  console.log(path.relative(root, next));
} else if (type === "article") {
  const [, , , slug, title, shorttitle, url] = process.argv;

  if (!slug) {
    console.error(
      "Missing slug, expected: new.js article <slug> [title] [shorttitle] [url]",
    );
    process.exit(1);
  }

  const articleDir = path.join(root, "articles", slug);

  if (fs.existsSync(articleDir)) {
    console.error(`Article "${slug}" already exists`);
    process.exit(1);
  }

  const headline = title || titleFromSlug(slug);

  const data = {
    // an external url makes this a link-only entry on the home page
    ...(url ? { url } : {}),
    title: headline,
    headline,
    shorttitle: shorttitle ?? "",
    subtitle: "",
    date: new Date().toISOString().split("T")[0],
  };

  fs.mkdirSync(articleDir, { recursive: true });
  fs.writeFileSync(
    path.join(articleDir, "metadata.json"),
    `${JSON.stringify(data, null, 2)}\n`,
  );

  // a url points somewhere else, so there's no body to write here — otherwise
  // start the entry so the build has something to render at <slug>.html
  if (!url) {
    fs.writeFileSync(
      path.join(articleDir, "entry.html"),
      `<p>${headline}</p>\n`,
    );
  }

  console.log(path.relative(root, articleDir));
} else {
  console.error(`Unknown type "${type ?? ""}", expected: link, article`);
  process.exit(1);
}
