import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { ClipRenderProps } from "../../src/clips/types";
import { ROOT } from "../lib/config";

export async function renderClip(
  dir: string,
  props: Omit<ClipRenderProps, "baseUrl">,
  output: string,
  onProgress: (p: number) => void,
) {
  // Only this job and its frozen brand/audio are exposed to the renderer.
  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    let rel: string;
    try {
      rel = decodeURIComponent((req.url || "/").split("?")[0]);
    } catch {
      res.writeHead(400).end();
      return;
    }
    const file = path.resolve(dir, "." + rel);
    if (
      !file.startsWith(dir + path.sep) ||
      !fs.existsSync(file) ||
      !fs.statSync(file).isFile()
    ) {
      res.writeHead(404).end();
      return;
    }
    const size = fs.statSync(file).size;
    const type =
      (
        {
          ".mp4": "video/mp4",
          ".mp3": "audio/mpeg",
          ".wav": "audio/wav",
          ".m4a": "audio/mp4",
          ".ttf": "font/ttf",
          ".woff2": "font/woff2",
          ".otf": "font/otf",
        } as Record<string, string>
      )[path.extname(file)] || "application/octet-stream";
    const headers = { "Content-Type": type, "Accept-Ranges": "bytes" };
    if (req.headers.range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
      if (!match) {
        res.writeHead(416).end();
        return;
      }
      const start = Number(match[1]),
        end = Math.min(size - 1, match[2] ? Number(match[2]) : size - 1);
      if (start > end || start >= size) {
        res.writeHead(416).end();
        return;
      }
      res.writeHead(206, {
        ...headers,
        "Content-Length": end - start + 1,
        "Content-Range": `bytes ${start}-${end}/${size}`,
      });
      fs.createReadStream(file, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { ...headers, "Content-Length": size });
      fs.createReadStream(file).pipe(res);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const serveUrl = await bundle({
      entryPoint: path.join(ROOT, "src/clips/index.tsx"),
      outDir: path.join(dir, ".bundle"),
      publicDir: path.join(ROOT, "public"),
    });
    const inputProps = { ...props, baseUrl };
    const composition = await selectComposition({
      serveUrl,
      id: "Clip",
      inputProps,
    });
    await renderMedia({
      serveUrl,
      composition,
      inputProps,
      outputLocation: output,
      codec: "h264",
      audioCodec: "aac",
      crf: 18,
      concurrency: 2,
      onProgress: ({ progress }) => onProgress(progress),
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
