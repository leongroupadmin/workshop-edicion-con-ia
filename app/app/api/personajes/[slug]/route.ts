import { editarPersonaje, eliminarPersonaje } from "@/lib/clon/personajes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ slug: string }> };

export async function PUT(req: Request, ctx: Context) {
  try {
    const { slug } = await ctx.params;
    return Response.json({ personaje: editarPersonaje(slug, await req.json()) });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, ctx: Context) {
  try {
    const { slug } = await ctx.params;
    await eliminarPersonaje(slug);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
