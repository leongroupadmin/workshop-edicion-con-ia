import fs from "node:fs";
import path from "node:path";
import { BRAND_DIR, safeFilename, saveBody, writeJson } from "@/lib/server/fsutil";
import { readBrand } from "@/lib/server/brand";

export const dynamic = "force-dynamic";

const LOGO_EXTS = [".png", ".svg", ".jpg", ".jpeg", ".webp"];
const FONT_EXTS = [".woff2", ".woff", ".ttf", ".otf"];

/**
 * Sube logo o tipografía a /assets/brand.
 * ?kind=logo | font  (&family=Nombre&weight=700 para fuentes)
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const original = decodeURIComponent(req.headers.get("x-filename") ?? "archivo");
  const ext = path.extname(original).toLowerCase();
  const brand = readBrand();

  if (kind === "logo") {
    if (!LOGO_EXTS.includes(ext)) return Response.json({ error: "El logo tiene que ser PNG, SVG, JPG o WEBP." }, { status: 400 });
    const name = `logo${ext}`;
    // Sacar logos anteriores con otra extensión
    for (const e of LOGO_EXTS) fs.rmSync(path.join(BRAND_DIR, `logo${e}`), { force: true });
    await saveBody(req, path.join(BRAND_DIR, name));
    brand.logo = name;
  } else if (kind === "font") {
    if (!FONT_EXTS.includes(ext)) return Response.json({ error: "La tipografía tiene que ser WOFF2, WOFF, TTF u OTF." }, { status: 400 });
    const file = safeFilename(original);
    await saveBody(req, path.join(BRAND_DIR, "fonts", file));
    const family = url.searchParams.get("family")?.trim() || file.replace(/\.[^.]+$/, "").replace(/[-_](regular|bold|black|medium|light|semibold|extrabold|\d{3})$/i, "");
    const weight = Number(url.searchParams.get("weight")) || undefined;
    brand.fonts.files = [...(brand.fonts.files ?? []).filter((f) => f.file !== file), { family, file, weight }];
    if (url.searchParams.get("useFor") === "heading" || !brand.fonts.files.some((f) => f.family === brand.fonts.heading)) {
      brand.fonts.heading = family;
    }
    if (url.searchParams.get("useFor") === "body") brand.fonts.body = family;
  } else {
    return Response.json({ error: "kind debe ser logo o font" }, { status: 400 });
  }
  writeJson(path.join(BRAND_DIR, "brand.json"), brand);
  return Response.json({ brand });
}

/** Borrar una tipografía: ?file=nombre.woff2 */
export async function DELETE(req: Request) {
  const file = new URL(req.url).searchParams.get("file") ?? "";
  const brand = readBrand();
  brand.fonts.files = (brand.fonts.files ?? []).filter((f) => f.file !== file);
  if (file && /^[\w.-]+$/.test(file)) fs.rmSync(path.join(BRAND_DIR, "fonts", file), { force: true });
  writeJson(path.join(BRAND_DIR, "brand.json"), brand);
  return Response.json({ brand });
}
