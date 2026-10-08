import { fontLibrary, withLibraryFonts } from "@/lib/server/font-library";
import fs from "node:fs";
import path from "node:path";
import { BRAND_FILE, readBrand } from "@/lib/server/brand";
import { BRAND_DIR, writeJson } from "@/lib/server/fsutil";
import type { Brand } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const brand = readBrand();
  const fontsDir = path.join(BRAND_DIR, "fonts");
  const fontFiles = fs.existsSync(fontsDir) ? fs.readdirSync(fontsDir).filter((f) => /\.(woff2?|ttf|otf)$/i.test(f)) : [];
  return Response.json({ brand, fontFiles, library: fontLibrary() });
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export async function POST(req: Request) {
  const patch = (await req.json()) as Partial<Brand>;
  const brand = readBrand();
  const next: Brand = {
    ...brand,
    name: patch.name?.trim() || brand.name,
    colors: { ...brand.colors },
    fonts: { ...brand.fonts, ...(patch.fonts ?? {}) },
    logo: patch.logo ?? brand.logo,
  };
  for (const [k, v] of Object.entries(patch.colors ?? {})) {
    if (HEX.test(v)) (next.colors as Record<string, string>)[k] = v.toUpperCase();
  }
  const ready = withLibraryFonts(next);
  writeJson(BRAND_FILE, ready);
  return Response.json({ brand: ready });
}
