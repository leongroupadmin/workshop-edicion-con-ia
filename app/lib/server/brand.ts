import "server-only";
import { withLibraryFonts } from "./font-library";
import path from "node:path";
import type { Brand } from "../types";
import { BRAND_DIR, readJson } from "./fsutil";

export const BRAND_FILE = path.join(BRAND_DIR, "brand.json");

const DEFAULT: Brand = {
  name: "Mi marca",
  colors: { primary: "#FFB600", secondary: "#FFD04A", background: "#0A0A0A", text: "#FFFFFF", highlight: "#FFB600" },
  fonts: { heading: "Inter", body: "Inter", subtitleAccent: "Lora cursiva", files: [] },
  logo: "",
};

export const readBrand = (): Brand => {
  const b = readJson<Partial<Brand>>(BRAND_FILE, {});
  return withLibraryFonts({
    ...DEFAULT,
    ...b,
    colors: { ...DEFAULT.colors, ...(b.colors ?? {}) },
    fonts: { ...DEFAULT.fonts, ...(b.fonts ?? {}) },
  });
};
