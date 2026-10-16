import path from "node:path";
import { clipDir, readJob } from "@/lib/clips/server";
import { fileResponse } from "@/lib/server/fsutil";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; name: string }> },
) {
  try {
    const { id, name } = await params,
      job = readJob(id);
    // No arbitrary paths, logs, configuration or credentials can be served.
    if (
      name !== job.source &&
      !job.clips.some(
        (c) =>
          c.file === name ||
          (c.file && c.file.replace(/\.mp4$/, ".jpg") === name),
      )
    )
      return new Response("No encontrado", { status: 404 });
    const download = new URL(req.url).searchParams.has("download");
    return fileResponse(
      path.join(clipDir(id), name),
      req,
      download ? name : undefined,
    );
  } catch {
    return new Response("No encontrado", { status: 404 });
  }
}
