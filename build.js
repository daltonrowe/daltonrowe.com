import * as fs from "node:fs";
import * as path from "node:path";

function template(template, contents, defaults) {
  let markup = template;

  if (contents.indexOf("%%%") !== -1) {
    const [metaStr, content] = contents.split("%%%");
    const meta = { ...defaults, ...JSON.parse(metaStr) };

    for (const key in meta) {
      markup = markup.replaceAll(`{{${key}}}`, meta[key]);
    }

    markup = markup.replace("{{content}}", content);
  } else {
    markup = markup.replace("{{content}}", contents);
  }

  return markup;
}

// clear out existing folders

const distPath = path.join(import.meta.dirname, "dist");
const distExists = fs.existsSync(distPath);

if (distExists) fs.rmSync(distPath, { recursive: true });
fs.mkdirSync(distPath);

// generate articles

const articlesPath = path.join(import.meta.dirname, "articles");
const articles = fs.readdirSync(articlesPath);

const articlesTemplatePath = path.join(
  import.meta.dirname,
  "templates",
  "article.html",
);
const articleTemplate = fs.readFileSync(articlesTemplatePath, {
  encoding: "utf-8",
});

for (const article of articles) {
  const articlePath = path.join(articlesPath, article);
  const articleContent = fs.readFileSync(articlePath, { encoding: "utf-8" });

  const markup = template(articleTemplate, articleContent, {
    title: "",
    headline: "",
    subtitle: "",
  });

  const outPath = path.join(distPath, article);
  fs.writeFileSync(outPath, markup, { encoding: "utf-8" });
}

// copy static assets

for (const rootFile of ["favicon.svg", "index.html", "resume.html"]) {
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
