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

function generate(dirName, templateName, meta, subDir = "") {
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

  const distDirPath = path.join(distPath, subDir);
  if (subDir) fs.mkdirSync(distDirPath);

  for (const file of contentFiles) {
    const contentPath = path.join(contentDir, file);
    const content = fs.readFileSync(contentPath, { encoding: "utf-8" });

    const generated = template(
      templateContent,
      typeof meta === "function" ? meta(file, content) : meta,
    );

    const distFilePath = path.join(distDirPath, `${file.split(".")[0]}.html`);
    fs.writeFileSync(distFilePath, generated, {
      encoding: "utf-8",
      recursive: true,
    });
  }
}

// generate articles

generate("articles", "article.html", (file, content) => {
  const [meta, html] = content.split("%%%");

  const json = JSON.parse(meta);

  return {
    title: json.title ?? "",
    headline: json.headline ?? "",
    subtitle: json.subtitle ?? "",
    html,
  };
});

// generate thoughts

generate(
  "thoughts",
  "thought.html",
  (file, content) => {
    const date = new Date(file.split(".")[0]);

    const title = date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const meta = {
      title,
      html: content,
    };

    return meta;
  },
  "thoughts",
);

// generate links

generate(
  "links",
  "link.html",
  (file, content) => {
    const filename = file.split(".")[0];
    const dateStr = filename.includes("_") ? filename.split("_")[0] : filename;
    const date = new Date(dateStr);

    const title = date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const json = JSON.parse(content);

    let html = "";
    if (json.description) html += `<p>${json.description}</p>`;
    if (json.quote) html += `<blockquote>${json.quote}</blockquote>`;

    const meta = {
      title,
      html,
    };

    return meta;
  },
  "links",
);

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
