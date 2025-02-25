import * as fs from "node:fs";
import * as path from "node:path";

function template(template, contents, defaults) {
  const [metaStr, content] = contents.split("%%%");
  const meta = { ...JSON.parse(metaStr), ...defaults };

  let markup = template;

  for (const key in meta) {
    markup = markup.replaceAll(`{{${key}}}`, meta[key]);
  }

  markup = markup.replace("{{content}}", content);

  return markup;
}

// clear out existing folders

const distPath = path.join(import.meta.dirname, "dist");
const distExists = fs.existsSync(distPath);

if (distExists) fs.rmdirSync(distPath, { recursive: true });
fs.mkdirSync(distPath)

// generate articles

const articlesPath = path.join(import.meta.dirname, "articles");
const articles = fs
  .readdirSync(articlesPath);

const articlesTemplatePath = path.join(
  import.meta.dirname,
  "templates",
  "article.html",
);
const articleTemplate = fs.readFileSync(articlesTemplatePath, {
  encoding: "utf-8",
});

for (const article of articles) {
  const articlePath = path.join(articlesPath, article)
  const articleContent = fs.readFileSync(articlePath, { encoding: "utf-8" });

  const markup = template(articleTemplate, articleContent, {
    title: "",
    headline: "",
    subtitle: ""
  });

  const outPath = path.join(distPath, article)
  fs.writeFileSync(outPath, markup, { encoding: "utf-8" });
}

// copy static assets

fs.cpSync(
  path.join(import.meta.dirname, "favicon.svg"),
  path.join(import.meta.dirname, "dist"),
);
fs.cpSync(
  path.join(import.meta.dirname, "index.html"),
  path.join(import.meta.dirname, "dist"),
);

for (const cpPath of ["css", "img", "js"]) {
  fs.cpSync(
    path.join(import.meta.dirname, cpPath),
    path.join(distPath, cpPath),
    { recursive: true },
  );
}
