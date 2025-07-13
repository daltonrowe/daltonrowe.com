import * as http from 'node:http';
import * as fs from 'fs';
import { URL } from 'node:url';
import { generateArticleMeta } from './lib.js';

const PROTOCOL = 'http://'
const PORT = 3000;
const HOST = 'localhost'
const BASE = `${PROTOCOL}${HOST}`

function camelize(snake) {
  const parts = snake.split("_")
  return parts.map(part => `${part.substring(0, 1).toUpperCase()}${part.substring(1).toLowerCase()}`)
}

const handlers = {
  getBlocks: function () {
    return { hello: 'world!' }
  },
  getEdit: function (req, res, data) {
    const { searchParams } = data

    const article = searchParams.get('article')

    const content = fs.readFileSync(`./articles/${article}.html`, { encoding: "utf-8" });
    const template = fs.readFileSync(`./templates/article.html`, { encoding: "utf-8" });
    const meta = generateArticleMeta(template, content);

    if (meta.html) {
      const html = fillTemplate(template, meta)
      return { html }
    }
  }
}

const server = http.createServer({ keepAliveTimeout: 60000 }, (req, res) => {

  function handleRequest(req, res) {

    const { method } = req;

    const url = new URL(req.url, BASE)
    const searchParams = url.searchParams

    const handler = `${method.toLowerCase()}${camelize(url.pathname.substring(1))}`

    if (handlers[handler]) return handlers[handler](req, res, { searchParams })
  }

  try {
    const data = handleRequest(req, res)

    if (data) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data))
    } else {
      res.writeHead(404);
      res.end()
    }

  } catch (error) {
    console.error(error)
    res.writeHead(500);
    res.end();
  }
});

server.listen(PORT);