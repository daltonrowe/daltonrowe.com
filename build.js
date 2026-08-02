import * as fs from "node:fs";
import * as path from "node:path";

// clear out existing folders

const host = process.env.SITE_HOST ?? ""

const distPath = path.join(import.meta.dirname, "dist");
const distExists = fs.existsSync(distPath);

if (distExists) fs.rmSync(distPath, { recursive: true });
fs.mkdirSync(distPath);

// dates as displayed to user

function humanDate(date) {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    // filenames are bare dates, parsed as UTC midnight — format them the same
    // way so the build doesn't shift dates on machines west of UTC
    timeZone: "UTC",
  });
}

// process link json

function markupLink(json) {
  let html = "";
  if (json.quote)
    html += `<blockquote>&quot;${json.quote.replaceAll("\n", "<br>")}&quot;</blockquote>`;
  if (json.description)
    html += `<p>${json.description.replaceAll("\n", "<br>")}</p>`;

  return html;
}

// get template

function loadTemplate(templateName) {
  const templatePath = path.join(
    import.meta.dirname,
    "templates",
    templateName,
  );

  const template = fs.readFileSync(templatePath, {
    encoding: "utf-8",
  });

  return template;
}

// templating

function fillTemplate(template, meta) {
  let markup = template;

  for (const key in meta) {
    markup = markup.replaceAll(`{{${key}}}`, meta[key]);
  }

  return markup;
}

function generate(dirName, templateName, buildMeta, subDir = "") {
  const contentDir = path.join(import.meta.dirname, dirName);
  const contentFiles = fs.readdirSync(contentDir);

  const template = loadTemplate(templateName);

  const distDirPath = path.join(distPath, subDir);
  if (subDir) fs.mkdirSync(distDirPath);

  for (const file of contentFiles) {
    const contentPath = path.join(contentDir, file);
    const content = fs.readFileSync(contentPath, { encoding: "utf-8" });

    const meta = buildMeta(file, content);

    if (meta.html) {
      const generated = fillTemplate(template, meta);

      const distFilePath = path.join(distDirPath, `${file.split(".")[0]}.html`);
      fs.writeFileSync(distFilePath, generated, {
        encoding: "utf-8",
        recursive: true,
      });
    }
  }
}

// generate links

const linksContent = {};

generate(
  "links",
  "link.html",
  (file, content) => {
    const filename = file.split(".")[0];
    const dateStr = filename.includes("_") ? filename.split("_")[0] : filename;
    const date = new Date(dateStr);

    const title = humanDate(date);
    const json = JSON.parse(content);
    const html = markupLink(json);

    const meta = {
      ...json,
      title,
      html,
      filename,
    };

    if (!linksContent[date.getFullYear()])
      linksContent[date.getFullYear()] = [];
    linksContent[date.getFullYear()].unshift(meta);

    return meta;
  },
  "links",
);

// generate links root

(() => {
  const template = loadTemplate("home.html");
  const itemContent = loadTemplate("link-item.html");

  let html = "";

  for (const year in linksContent) {
    let section = "";
    section += `<section data-year="${year}"><h2>${year}</h2>`;

    for (const link of linksContent[year]) {
      section += fillTemplate(itemContent, link);
    }

    section += "</section>";
    html = section + html;
  }

  html = `<article id="links">${html}</article>`;

  const generated = fillTemplate(template, {
    title: "Dalton Rowe - Links",
    html,
  });

  const distFilePath = path.join(distPath, "links.html");
  fs.writeFileSync(distFilePath, generated, {
    encoding: "utf-8",
  });
})();

const articlesContent = [];

// generate articles
//
// each article is a directory: metadata.json describes it, entry.html holds
// the body (absent for link-only entries), and any other file is an image
// copied out to img/ below.

(() => {
  const contentDir = path.join(import.meta.dirname, "articles");
  const template = loadTemplate("article.html");

  for (const slug of fs.readdirSync(contentDir)) {
    const articleDir = path.join(contentDir, slug);
    if (!fs.statSync(articleDir).isDirectory()) continue;

    const metadataPath = path.join(articleDir, "metadata.json");
    if (!fs.existsSync(metadataPath)) continue;

    const json = JSON.parse(
      fs.readFileSync(metadataPath, { encoding: "utf-8" }),
    );

    const entryPath = path.join(articleDir, "entry.html");
    const html = fs.existsSync(entryPath)
      ? fs.readFileSync(entryPath, { encoding: "utf-8" })
      : "";

    const meta = {
      title: json.title ?? "",
      headline: json.headline ?? "",
      subtitle: json.subtitle ?? "",
      // no url and no body means there's nothing to link to yet — home.css
      // styles that case so the thumbnail doesn't animate like a real link
      url: json.url ?? (html.trim() ? `${slug}.html` : "#no-article-yet"),
      attrs: json.url?.includes("://") ? 'target="_blank"' : "",
      thumb: slug,
      shorttitle: json.shorttitle ?? json.subtitle,
      datetime: new Date(json.date).getTime(),
      html,
    };

    articlesContent.push(meta);

    if (!html.trim()) continue;

    const generated = fillTemplate(template, meta);

    const distFilePath = path.join(distPath, `${slug}.html`);
    fs.writeFileSync(distFilePath, generated, { encoding: "utf-8" });
  }
})();

// generate home

(() => {
  const template = loadTemplate("home.html");
  const itemContent = loadTemplate("article-item.html");

  let html = "";

  articlesContent.sort((a, b) => (a.datetime < b.datetime ? 1 : -1));

  for (const article of articlesContent) {
    html += fillTemplate(itemContent, { ...article, host });
  }

  html = `<section id="projects"><ul>${html}</ul></section>`;

  const generated = fillTemplate(template, {
    title: "Dalton Rowe",
    html,
  });

  const distFilePath = path.join(distPath, "index.html");

  fs.writeFileSync(distFilePath, generated, {
    encoding: "utf-8",
  });
})();

// copy static assets

fs.cpSync(
  path.join(import.meta.dirname, "favicon.svg"),
  path.join(distPath, "favicon.svg"),
);

// standalone pages sit at the root alongside the generated ones

const pagesDir = path.join(import.meta.dirname, "pages");

for (const page of fs.readdirSync(pagesDir)) {
  fs.cpSync(path.join(pagesDir, page), path.join(distPath, page));
}

// assets/ is flat, but templates reference /css and /js

const assetDirs = { ".css": "css", ".js": "js" };
const assetsDir = path.join(import.meta.dirname, "assets");

for (const asset of fs.readdirSync(assetsDir)) {
  const assetDir = assetDirs[path.extname(asset)];
  if (!assetDir) continue;

  fs.mkdirSync(path.join(distPath, assetDir), { recursive: true });
  fs.cpSync(
    path.join(assetsDir, asset),
    path.join(distPath, assetDir, asset),
  );
}

// article images: the thumbnail is img/<slug>.png, everything else is
// referenced from the entry as img/<slug>/<file>

const articlesDir = path.join(import.meta.dirname, "articles");

for (const slug of fs.readdirSync(articlesDir)) {
  const articleDir = path.join(articlesDir, slug);
  if (!fs.statSync(articleDir).isDirectory()) continue;

  for (const file of fs.readdirSync(articleDir)) {
    if (file === "metadata.json" || file === "entry.html") continue;

    const distFilePath =
      file === `${slug}.png`
        ? path.join(distPath, "img", file)
        : path.join(distPath, "img", slug, file);

    fs.mkdirSync(path.dirname(distFilePath), { recursive: true });
    fs.cpSync(path.join(articleDir, file), distFilePath);
  }
}
