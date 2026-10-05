import { MUSIC_DIR } from "@/lib/server/fsutil";
import { downloadMusic, searchMusic } from "@/lib/server/heygen";

export const dynamic = "force-dynamic";

/**
 * Agregar un tema de HeyGen a /assets/music. Se vuelve a buscar del lado del
 * servidor (no se baja ninguna URL que mande el navegador).
 */
export async function POST(req: Request) {
  const { q, id } = (await req.json()) as { q?: string; id?: string };
  if (!q || !id) return Response.json({ error: "Falta el tema." }, { status: 400 });
  try {
    const match = (await searchMusic(q, 12)).find((r) => r.id === id);
    if (!match) return Response.json({ error: "No encontré ese tema; buscalo de nuevo." }, { status: 404 });
    const file = await downloadMusic(match, MUSIC_DIR);
    return Response.json({ file });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 409 });
  }
}
