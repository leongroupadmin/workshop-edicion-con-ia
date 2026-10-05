import { subscribe } from "@/lib/server/bus";
import { exists, readStatus } from "@/lib/server/projects";
import type { ServerEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events del proyecto: estado del pipeline, respuesta de Claude
 * en streaming y avisos de "refrescar". Los scripts escriben status.json
 * desde otro proceso, así que además se revisa ese archivo cada segundo.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/projects/[id]/events">) {
  const { id } = await ctx.params;
  if (!exists(id)) return new Response("No existe", { status: 404 });
  const enc = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (e: ServerEvent | { type: "ping" }) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          closed = true;
        }
      };
      let last = JSON.stringify(readStatus(id));
      send({ type: "status", status: JSON.parse(last) });
      const unsub = subscribe(id, (e) => {
        if (e.type === "status") last = JSON.stringify(e.status);
        send(e);
      });
      const poll = setInterval(() => {
        const now = JSON.stringify(readStatus(id));
        if (now !== last) {
          last = now;
          send({ type: "status", status: JSON.parse(now) });
        }
      }, 1000);
      const ping = setInterval(() => send({ type: "ping" }), 15000);
      cleanup = () => {
        closed = true;
        unsub();
        clearInterval(poll);
        clearInterval(ping);
        try {
          controller.close();
        } catch {
          /* ya cerrado */
        }
      };
      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
