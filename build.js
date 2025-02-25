import * as fs from "node:fs";
import * as path from "node:path";

// clear out existing folders

const distPath = path.join(import.meta.dirname, "dist");
const distExists = fs.existsSync(distPath);

if (distExists) fs.rmSync(distPath, { recursive: true });
fs.mkdirSync(distPath);

// templating

function template(template, meta) {
  let markup = template;

  for (const key in meta) {
    markup = markup.replaceAll(`{{${key}}}`, meta[key]);
  }

  return markup;
}

function generate(dirName, templateName, meta) {
  const contentDir = path.join(import.meta.dirname, dirName);
  const contentFiles = fs.readdirSync(contentDir);

  const templatePath = path.join(
    import.meta.dirname,
    "templates",
    templateName,
  );

  const templateContent = fs.readFileSync(templatePath, {
    encoding: "utf-8",
  });

  for (const file of contentFiles) {
    const contentPath = path.join(contentDir, file);
    const content = fs.readFileSync(contentPath, { encoding: "utf-8" });

    const generated = template(
      templateContent,
      typeof meta === "function" ? meta(file, content) : meta,
    );

    const distFilePath = path.join(distPath, `${file.split(".")[0]}.html`);
    fs.writeFileSync(distFilePath, generated, { encoding: "utf-8" });
  }
}

// generate articles

generate("articles", "article.html", (file, content) => {
  const [meta, html] = content.split("%%%");

  const json = JSON.parse(meta)

  return {
    title: json.title ?? "",
    headline: json.headline ?? "",
    subtitle: json.subtitle ?? "",
    html
  }
});

// generate thoughts

generate("thoughts", "thought.html", (file, content) => {
  const date = new Date(file.split(".")[0]);

  const title = date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })

  const meta = {
    title,
    headline: title,
    subtitle: title,
    html: content
  }

  return meta;
});

// generate links

generate("links", "link.html", (file, content) => {
  const date = new Date(file.split(".")[0]);

  const title = date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })

  const meta = {
    title,
    headline: title,
    subtitle: title,
    ...JSON.parse(content)
  }

  return meta;
});

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
