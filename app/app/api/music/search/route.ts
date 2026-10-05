import { searchMusic } from "@/lib/server/heygen";

export const dynamic = "force-dynamic";

/** Buscar música en la biblioteca de HeyGen. ?q=estilo */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q) return Response.json({ error: "Escribí qué música buscás." }, { status: 400 });
  try {
    return Response.json({ results: await searchMusic(q, 12) });
  } catch (err) {
    const msg = (err as Error).message;
    return Response.json({ error: msg, signedOut: /sesión de HeyGen/.test(msg) }, { status: 409 });
  }
}
