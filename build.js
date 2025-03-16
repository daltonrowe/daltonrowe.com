import * as fs from "node:fs";
import * as path from "node:path";

// clear out existing folders

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
  });
}

// process link json

function markupLink(json) {
  let html = "";
  if (json.quote) html += `<blockquote>&quot;${json.quote.replaceAll('\n', '<br>')}&quot;</blockquote>`;
  if (json.description) html += `<p>${json.description.replaceAll('\n', '<br>')}</p>`;

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

  return template
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

    const meta = buildMeta(file, content)

    if (!meta.html) return;

    const generated = fillTemplate(
      template,
      meta,
    );

    const distFilePath = path.join(distDirPath, `${file.split(".")[0]}.html`);
    fs.writeFileSync(distFilePath, generated, {
      encoding: "utf-8",
      recursive: true,
    });
  }
}

// generate links

const linksContent = {}

generate(
  "links",
  "link.html",
  (file, content) => {
    const filename = file.split(".")[0];
    const dateStr = filename.includes("_") ? filename.split("_")[0] : filename;
    const date = new Date(dateStr)

    const title = humanDate(date)
    const json = JSON.parse(content);
    const html = markupLink(json)

    const meta = {
      ...json,
      title,
      html,
      filename
    };

    if (!linksContent[date.getFullYear()]) linksContent[date.getFullYear()] = []
    linksContent[date.getFullYear()].unshift(meta)

    return meta;
  },
  "links",
);

// generate links root

(() => {
  const template = loadTemplate('home.html')
  const itemContent = loadTemplate('link-item.html')

  let html = '';

  for (const year in linksContent) {
    let section = ''
    section += `<section data-year="${year}"><h2>${year}</h2>`

    for (const link of linksContent[year]) {
      section += fillTemplate(itemContent, link)
    }

    section += `</section>`
    html = section + html
  }

  html = `<article id="links">${html}</article>`

  const generated = fillTemplate(template, {
    title: 'Dalton Rowe - Links',
    html
  })

  const distFilePath = path.join(distPath, 'links.html');
  fs.writeFileSync(distFilePath, generated, {
    encoding: "utf-8",
  });
})();

const articlesContent = []

// generate articles

generate("articles", "article.html", (file, content) => {
  const [filemeta, html] = content.split("%%%");

  const json = JSON.parse(filemeta);

  const meta = {
    title: json.title ?? "",
    headline: json.headline ?? "",
    subtitle: json.subtitle ?? "",
    url: json.url ?? file,
    attrs: json.url?.includes('://') ? 'target="_blank"' : '',
    thumb: file.split('.')[0],
    shorttitle: json.shorttitle ?? json.subtitle,
    datetime: new Date(json.date).getTime(),
    html,
  }

  articlesContent.push(meta)

  return meta;
});

// generate home

(() => {
  const template = loadTemplate('home.html')
  const itemContent = loadTemplate('article-item.html')

  let html = ''

  articlesContent.sort((a, b) => a.datetime < b.datetime ? 1 : -1)

  for (const article of articlesContent) {
    html += fillTemplate(itemContent, article)
  }

  html = `<section id="projects"><ul>${html}</ul></section>`

  const generated = fillTemplate(template, {
    title: 'Dalton Rowe',
    html,
  })

  const distFilePath = path.join(distPath, 'index.html');

  fs.writeFileSync(distFilePath, generated, {
    encoding: "utf-8",
  });
})();

// copy static assets

for (const rootFile of ["favicon.svg", "resume.html"]) {
  fs.cpSync(
    path.join(import.meta.dirname, rootFile),
    path.join(import.meta.dirname, "dist", rootFile),
  );
}

for (const cpPath of ["css", "img", "js"]) {
  fs.cpSync(
    path.join(import.meta.dirname, cpPath),
    path.join(distPath, cpPath),
    { recursive: true },
  );
}
