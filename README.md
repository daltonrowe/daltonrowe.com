# daltonrowe.com

Static site generator for daltonrowe.com. Content lives in `articles/` and
`links/`, templates in `templates/`, and `build.js` renders everything into
`dist/`.

## Build

```
node --watch-path=./articles build.js         # build and watch article content
npx --yes serve dist                          # serve dist/ locally
```

Set `SITE_HOST` to prefix the home page thumbnail urls with an absolute host.
It also sets the host used by the feed, which falls back to
`https://daltonrowe.com` when unset.

## Feed

The build writes an Atom feed to `dist/feed.xml` covering every article that
has somewhere to point — placeholder entries with no body and no url are left
out. Articles with a body carry their full html, with relative urls rewritten
against the host so images and links resolve inside a reader. The home page and
article pages advertise it with `<link rel="alternate">`.

## New content

`scripts/new.js` scaffolds an entry. Both modes print the path they wrote.

### Articles

```
node scripts/new.js article <slug> [title] [shorttitle] [url]
```

Creates `articles/<slug>/` with a `metadata.json` dated today, plus a starter
`entry.html` that the build renders to `dist/<slug>.html`. Pass a `url` for a
link-only entry — the home page then points at that url and no `entry.html` is
written. Title defaults to the slug in title case.

Drop images into `articles/<slug>/`: `<slug>.png` becomes the home page
thumbnail, and anything else is copied to `img/<slug>/` for the entry to
reference.

### Links

```
node scripts/new.js link [url] [description] [quote]
```

Creates `links/<today>.json`, suffixed `_1`, `_2`, ... when the day already has
an entry. Links are grouped by year on `dist/links.html`.
