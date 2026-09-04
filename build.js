import * as fs from "node:fs";
import * as path from "node:path";

// clear out existing folders

const host = process.env.SITE_HOST ?? ""

// feeds need absolute urls, so fall back to the production host when the
// build isn't given one

const siteUrl = (host || "https://daltonrowe.com").replace(/\/+$/, "");
const siteTitle = "Dalton Rowe";
const siteAuthor = "Dalton Rowe";
const siteDescription =
  "Product focused web developer. Projects, writing, and links.";

// drop an og.png next to favicon.svg to give the pages that have no image of
// their own a share card

const defaultImage = fs.existsSync(
  path.join(import.meta.dirname, "og.png"),
)
  ? `${siteUrl}/og.png`
  : "";

const defaultImageSize = defaultImage
  ? pngSize(path.join(import.meta.dirname, "og.png"))
  : null;

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

// xml helpers

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

// feed readers render entries away from the site, so site relative src/href
// values have to be rewritten against the host

function absoluteUrls(html) {
  return html.replaceAll(
    /(\s(?:src|href)=")(?!https?:|\/\/|#|mailto:|data:)([^"]*)"/g,
    (_match, attr, url) => `${attr}${siteUrl}/${url.replace(/^\//, "")}"`,
  );
}

// open graph
//
// every generated page gets a card. descriptions come from the metadata when
// it has one and fall back to the opening paragraph of the body.

function escapeAttr(value) {
  return escapeXml(value).replaceAll("&apos;", "&#39;");
}

// entities have to come back out before the text is escaped again for the
// attribute, or an & in the body reaches the card as &amp;amp;

function decodeEntities(text) {
  return text
    .replaceAll("&nbsp;", " ")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function stripTags(html) {
  return decodeEntities(
    html
      .replaceAll(/<[^>]*>/g, " ")
      .replaceAll(/\s+/g, " ")
      .trim(),
  );
}

function firstParagraph(html) {
  const match = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  return match ? stripTags(match[1]) : "";
}

// square thumbnails belong on a small card, wide ones on a large card, so the
// png header decides which is advertised

function pngSize(filePath) {
  if (!fs.existsSync(filePath)) return null;

  const header = fs.readFileSync(filePath).subarray(0, 24);
  if (header.length < 24 || header.toString("ascii", 1, 4) !== "PNG")
    return null;

  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
}

function truncate(text, max = 200) {
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

function ogTags({
  title,
  description = "",
  url,
  image = defaultImage,
  imageSize = image === defaultImage ? defaultImageSize : null,
  type = "website",
  publishedTime = "",
  indent = 4,
}) {
  const text = truncate(description);

  const tags = [
    ["og:site_name", siteTitle],
    ["og:type", type],
    ["og:title", title],
    ["og:url", url],
  ];

  if (text) tags.push(["og:description", text]);

  if (image) {
    tags.push(["og:image", image]);
    tags.push(["og:image:alt", title]);

    if (imageSize) {
      tags.push(["og:image:width", imageSize.width]);
      tags.push(["og:image:height", imageSize.height]);
    }
  }

  if (publishedTime) tags.push(["article:published_time", publishedTime]);

  const markup = tags.map(
    ([property, content]) =>
      `<meta property="${property}" content="${escapeAttr(content)}" />`,
  );

  const wide = imageSize && imageSize.width / imageSize.height >= 1.5;

  markup.push(
    `<meta name="twitter:card" content="${wide ? "summary_large_image" : "summary"}" />`,
  );

  if (text) markup.push(`<meta name="description" content="${escapeAttr(text)}" />`);

  return markup.join(`\n${" ".repeat(indent)}`);
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
      // og goes last: fillTemplate walks the keys in order, so anything after
      // it would scan the markup this just inserted
      og: ogTags({
        title: `Link: ${json.url}`,
        description: json.description || json.quote || "",
        url: `${siteUrl}/links/${filename}`,
        type: "article",
        publishedTime: date.toISOString(),
        indent: 2,
      }),
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
    og: ogTags({
      title: "Dalton Rowe - Links",
      description: "Links worth keeping, collected by Dalton Rowe.",
      url: `${siteUrl}/links`,
    }),
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

    meta.og = ogTags({
      title: meta.title,
      // meta.shorttitle falls back to the subtitle, which is often just a
      // date — the opening paragraph reads better than that
      description:
        json.shorttitle || firstParagraph(html) || json.subtitle || "",
      url: `${siteUrl}/${slug}.html`,
      image: `${siteUrl}/img/${slug}.png`,
      imageSize: pngSize(path.join(articleDir, `${slug}.png`)),
      type: "article",
      publishedTime: new Date(json.date).toISOString(),
    });

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
    og: ogTags({
      title: siteTitle,
      description: siteDescription,
      url: `${siteUrl}/`,
    }),
  });

  const distFilePath = path.join(distPath, "index.html");

  fs.writeFileSync(distFilePath, generated, {
    encoding: "utf-8",
  });
})();

// generate atom feed
//
// every article that has somewhere to point, newest first. entries with a
// body carry the full html; link only entries just carry their blurb.

(() => {
  const entries = [...articlesContent]
    .filter((article) => !article.url.startsWith("#"))
    .sort((a, b) => b.datetime - a.datetime);

  const updated = new Date(entries[0]?.datetime ?? Date.now()).toISOString();

  let xml = '<?xml version="1.0" encoding="utf-8"?>\n';
  xml += '<feed xmlns="http://www.w3.org/2005/Atom">\n';
  xml += `  <title>${escapeXml(siteTitle)}</title>\n`;
  xml += `  <id>${escapeXml(`${siteUrl}/`)}</id>\n`;
  xml += `  <link rel="alternate" type="text/html" href="${escapeXml(`${siteUrl}/`)}" />\n`;
  xml += `  <link rel="self" type="application/atom+xml" href="${escapeXml(`${siteUrl}/feed.xml`)}" />\n`;
  xml += `  <updated>${updated}</updated>\n`;
  xml += `  <author><name>${escapeXml(siteAuthor)}</name></author>\n`;

  for (const article of entries) {
    const external = article.url.includes("://");
    const link = external ? article.url : `${siteUrl}/${article.url}`;
    const date = new Date(article.datetime).toISOString();

    xml += "  <entry>\n";
    xml += `    <title>${escapeXml(article.title)}</title>\n`;
    xml += `    <id>${escapeXml(`${siteUrl}/${article.thumb}`)}</id>\n`;
    xml += `    <link rel="alternate" type="text/html" href="${escapeXml(link)}" />\n`;
    xml += `    <published>${date}</published>\n`;
    xml += `    <updated>${date}</updated>\n`;

    if (article.shorttitle)
      xml += `    <summary>${escapeXml(article.shorttitle)}</summary>\n`;

    if (article.html.trim())
      xml += `    <content type="html">${escapeXml(absoluteUrls(article.html))}</content>\n`;

    xml += "  </entry>\n";
  }

  xml += "</feed>\n";

  fs.writeFileSync(path.join(distPath, "feed.xml"), xml, {
    encoding: "utf-8",
  });
})();

// copy static assets

fs.cpSync(
  path.join(import.meta.dirname, "favicon.svg"),
  path.join(distPath, "favicon.svg"),
);

if (defaultImage)
  fs.cpSync(
    path.join(import.meta.dirname, "og.png"),
    path.join(distPath, "og.png"),
  );

// standalone pages sit at the root alongside the generated ones

const pagesDir = path.join(import.meta.dirname, "pages");

for (const page of fs.readdirSync(pagesDir)) {
  const source = path.join(pagesDir, page);
  const distFilePath = path.join(distPath, page);

  // hand written pages carry no metadata, so their card is built from the
  // title tag they already have

  if (path.extname(page) !== ".html") {
    fs.cpSync(source, distFilePath);
    continue;
  }

  let markup = fs.readFileSync(source, { encoding: "utf-8" });
  const title = markup.match(/<title>([\s\S]*?)<\/title>/i);

  if (title && !markup.includes("og:")) {
    const og = ogTags({
      title: stripTags(title[1]),
      description: siteDescription,
      url: `${siteUrl}/${page.replace(/\.html$/, "")}`,
      indent: 2,
    });

    // replacement callback: a $ in the description would otherwise be read
    // as a substitution pattern
    markup = markup.replace(title[0], () => `${title[0]}\n  ${og}`);
  }

  fs.writeFileSync(distFilePath, markup, { encoding: "utf-8" });
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
