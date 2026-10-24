import { expect, test } from "@playwright/test";

test("muestra los presets de edición al crear un video", async ({ page }) => {
  await page.route("**/api/defaults", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        aiProvider: "anthropic",
        format: "vertical",
        fps: 30,
        subtitles: { style: "minimal", size: 72, position: "bottom", maxWords: 3, uppercase: false },
        music: { enabled: true, volume: 0.25, duckTo: 0.3, track: "" },
        sfx: { enabled: true, volume: 0.4 },
        instructions: "",
        style: { pace: "normal", graphicsCount: 0, graphics: "bold", layoutUse: "auto", split: { position: "top", share: 0.5 }, cut: "normal", autoZoom: false },
      }),
    }),
  );
  await page.route("**/api/brands", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ brands: [] }) }));
  await page.goto("/nuevo");
  await expect(page.getByRole("heading", { name: "Nuevo video" })).toBeVisible();
  await expect(page.getByText("Preset de estilo de edición")).toBeVisible();
  await expect(page.getByRole("button", { name: "2D", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "3D simulado", exact: true }).click();
  await expect(page.getByText("Capas con perspectiva y profundidad aparente; render liviano.")).toBeVisible();
  await page.getByRole("button", { name: "3D real", exact: true }).click();
  await expect(page.getByText("Objetos con volumen, luces y cámara. Puede tardar más en renderizar.")).toBeVisible();
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await expect(page.getByText("Gráficos planos y animaciones como hasta ahora.")).toBeVisible();
  const presets = page.getByText("Preset de estilo de edición").locator("../..");
  await expect(presets.getByRole("button", { name: /Limpio/ })).toBeVisible();
  await expect(presets.getByRole("button", { name: /Dinámico/ })).toBeVisible();
  await expect(presets.getByRole("button", { name: /Corporativo/ })).toBeVisible();
  await expect(presets.getByRole("button", { name: /Redes sociales/ })).toBeVisible();
});
