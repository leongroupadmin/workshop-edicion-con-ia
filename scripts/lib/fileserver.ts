import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { ROOT } from "./config";

const TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".m4v": "video/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".json": "application/json",
};

/**
 * Servidor de archivos local (solo 127.0.0.1) para que Remotion lea los
 * videos del proyecto y los assets de marca sin copiarlos a public/.
 * Sirve únicamente /projects y /assets, con soporte de Range y CORS.
 */
export const startFileServer = (): Promise<{ url: string; close: () => Promise<void> }> =>
  new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "Range");
      res.setHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");
      if (req.method === "OPTIONS") {
        res.writeHead(204).end();
        return;
      }
      const rel = decodeURIComponent((req.url ?? "/").split("?")[0]).replace(/^\/+/, "");
      const file = path.resolve(ROOT, rel);
      const allowed =
        file.startsWith(path.join(ROOT, "projects") + path.sep) ||
        file.startsWith(path.join(ROOT, "assets") + path.sep);
      if (!allowed || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404).end("Not found");
        return;
      }
      const size = fs.statSync(file).size;
      const type = TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
      const range = req.headers.range;
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range);
        let start = m?.[1] ? parseInt(m[1], 10) : 0;
        let end = m?.[2] ? parseInt(m[2], 10) : size - 1;
        if (!m?.[1] && m?.[2]) {
          start = size - parseInt(m[2], 10);
          end = size - 1;
        }
        if (start >= size || end >= size || start > end) {
          res.writeHead(416, { "Content-Range": `bytes */${size}` }).end();
          return;
        }
        res.writeHead(206, {
          "Content-Type": type,
          "Content-Length": end - start + 1,
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Accept-Ranges": "bytes",
        });
        if (req.method === "HEAD") return void res.end();
        fs.createReadStream(file, { start, end }).pipe(res);
        return;
      }
      res.writeHead(200, { "Content-Type": type, "Content-Length": size, "Accept-Ranges": "bytes" });
      if (req.method === "HEAD") return void res.end();
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise<void>((r) => {
            server.closeAllConnections?.();
            server.close(() => r());
          }),
      });
    });
  });
