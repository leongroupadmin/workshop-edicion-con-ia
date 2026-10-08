import type { Brand, Settings } from "../pipeline/types";

/** Resuelve el énfasis por proyecto o la pareja guardada en su marca. */
export const captionAccent = (settings: Settings["subtitles"], brand: Brand) => {
  const choice = settings.accentFont ?? "brand";
  const family = choice === "lora" ? "Lora cursiva"
    : choice === "heading" || choice === "body" ? brand.fonts[choice]
    : brand.fonts.subtitleAccent || "Lora cursiva";
  return { family, cursive: family === "Lora cursiva" };
};
