import { activarBrand, deleteBrand, listBrands, saveCurrentBrand } from "@/lib/server/brands";

export const dynamic = "force-dynamic";

const fallo = (e: unknown) => Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });

/** GET: marcas guardadas. */
export async function GET() {
  try {
    return Response.json({ brands: listBrands() });
  } catch (e) {
    return fallo(e);
  }
}

/** POST: "guardar" la marca en uso, o "usar" una guardada. */
export async function POST(req: Request) {
  const { action, slug, name } = (await req.json().catch(() => ({}))) as {
    action?: string;
    slug?: string;
    name?: string;
  };
  try {
    if (action === "guardar") {
      // Guardar primero: si no, la lista sale sin la marca recién guardada.
      const saved = saveCurrentBrand(name);
      return Response.json({ ok: true, saved, brands: listBrands() });
    }
    if (action === "usar") {
      if (!slug) return Response.json({ error: "Falta la marca." }, { status: 400 });
      return Response.json({ ok: true, brand: activarBrand(slug), brands: listBrands() });
    }
    return Response.json({ error: "Acción desconocida." }, { status: 400 });
  } catch (e) {
    return fallo(e);
  }
}

/** DELETE ?slug=…: manda la marca guardada a la Papelera. */
export async function DELETE(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug) return Response.json({ error: "Falta la marca." }, { status: 400 });
  try {
    await deleteBrand(slug);
    return Response.json({ ok: true, brands: listBrands() });
  } catch (e) {
    return fallo(e);
  }
}
