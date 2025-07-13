export function fillTemplate(template, meta) {
  let markup = template;

  for (const key in meta) {
    markup = markup.replaceAll(`{{${key}}}`, meta[key]);
  }

  return markup;
}

export function generateArticleMeta(file, content) {
  const [filemeta, html] = content.split("%%%");

  const json = JSON.parse(filemeta);

  const meta = {
    title: json.title ?? "",
    headline: json.headline ?? "",
    subtitle: json.subtitle ?? "",
    url: json.url ?? file,
    attrs: json.url?.includes("://") ? 'target="_blank"' : "",
    thumb: file.split(".")[0],
    shorttitle: json.shorttitle ?? json.subtitle,
    datetime: new Date(json.date).getTime(),
    html,
  };

  articlesContent.push(meta);

  return meta;
}