import { expect, test } from "@playwright/test";
const id = "c-12345678-1234-1234-1234-123456789abc";
const clips = [1, 2, 3].map((n) => ({
  id: `clip-${n}`,
  title: `Idea número ${n}`,
  reason: "Una explicación que se entiende sin contexto.",
  startMs: (n - 1) * 60000,
  endMs: n * 60000 - 1000,
  selected: n !== 2,
  ...(n < 3 ? { file: `clip-${n}.mp4` } : {}),
}));
const job = {
  id,
  schema: "clips-v2",
  title: "Conversación sobre ideas",
  source: "source.mp4",
  durationMs: 300000,
  step: "done",
  message: "Listo",
  settings: { minSeconds: 20, maxSeconds: 90, subtitles: { style: "karaoke" } },
  clips,
};
async function fixture(page: import("@playwright/test").Page) {
  await page.route(`**/api/clips/${id}`, (r) =>
    r.fulfill({ json: { job, running: false, interrupted: false } }),
  );
  await page.route("**/file/*.mp4", (r) => r.fulfill({ status: 404 }));
  await page.goto(`/clips/${id}`);
  await expect(
    page.getByRole("button", { name: "Ver clip 1: Idea número 1" }),
  ).toBeVisible();
}
test("results show one player, persistent actions and independent clip details", async ({
  page,
}) => {
  await fixture(page);
  await expect(page.locator("video")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Ver clip 1: Idea número 1" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Ver clip 2: Idea número 2" }).click();
  await expect(page.getByLabel("Inicio clip 2")).toHaveValue("60");
  await expect(
    page.getByRole("link", { name: "Descargar este clip" }),
  ).toHaveAttribute("href", /clip-2.mp4/);
  await page.getByRole("button", { name: "Ver original" }).click();
  await expect(page.getByLabel("Fragmento original")).toBeVisible();
  await page.getByRole("button", { name: "Ver clip 3: Idea número 3" }).click();
  await expect(page.getByLabel("Fragmento original")).toBeVisible();
  await expect(page.locator("video")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Resultado", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Reproducir fragmento" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Renderizar seleccionados" }),
  ).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "Guardar ajustes" }),
  ).toBeInViewport();
});
test("render one clip preserves the batch selection and identifies only that clip", async ({
  page,
}) => {
  await fixture(page);
  await page.getByRole("button", { name: "Ver clip 3: Idea número 3" }).click();
  let body: Record<string, unknown> | undefined;
  await page.route(`**/api/clips/${id}`, (r) => {
    if (r.request().method() === "POST") {
      body = r.request().postDataJSON();
      return r.fulfill({ json: { ok: true } });
    }
    return r.fulfill({ json: { job, running: false, interrupted: false } });
  });
  await page
    .getByRole("button", { name: "Renderizar este clip", exact: true })
    .click();
  await expect.poll(() => body?.only).toBe("clip-3");
  expect(body?.clips).toEqual(clips);
});
test("real results layout fits desktop and mobile without horizontal page overflow", async ({
  page,
  request,
}) => {
  const response = await request.get("/api/clips");
  const data = await response.json();
  const real = data.jobs.find(
    (j: { id: string }) => j.id === "c-41346eda-8cc9-4880-90b4-062c66c9e4ac",
  );
  test.skip(!real, "Requires local regression footage");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/clips/${real.id}`);
  await expect(page.getByLabel("Resultado vertical")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Renderizar seleccionados" }),
  ).toBeInViewport();
  await expect
    .poll(
      () =>
        page
          .getByLabel("Resultado vertical")
          .evaluate((v: HTMLVideoElement) => v.readyState),
      { timeout: 20000 },
    )
    .toBeGreaterThanOrEqual(2);
  await page
    .getByLabel("Resultado vertical")
    .evaluate((v: HTMLVideoElement) => v.play());
  await expect
    .poll(() =>
      page
        .getByLabel("Resultado vertical")
        .evaluate((v: HTMLVideoElement) => v.currentTime),
    )
    .toBeGreaterThan(0.5);
  await page
    .getByLabel("Resultado vertical")
    .evaluate((v: HTMLVideoElement) => v.pause());
  await page.screenshot({ path: "/tmp/clips-results-desktop.png" });
  await page.setViewportSize({ width: 768, height: 900 });
  await expect(
    page.getByRole("button", { name: "Guardar ajustes" }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.querySelector("main")!.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "/tmp/clips-results-tablet.png" });
});

test("unrendered fragment plays immediately and stops at its selected end", async ({
  page,
  request,
}) => {
  const id = "c-41346eda-8cc9-4880-90b4-062c66c9e4ac";
  const response = await request.get(`/api/clips/${id}`);
  test.skip(!response.ok(), "Requires local regression footage");
  const { job } = await response.json();
  const index = job.clips.findIndex((c: { file?: string }) => !c.file);
  test.skip(index < 0, "Requires an unrendered proposal");
  const clip = job.clips[index];
  await page.goto(`/clips/${id}`);
  await page
    .getByRole("button", {
      name: `Ver clip ${index + 1}: ${clip.title}`,
      exact: true,
    })
    .click();
  const video = page.getByLabel("Fragmento original");
  await expect(video).toBeVisible();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState), {
      timeout: 20000,
    })
    .toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Reproducir fragmento" }).click();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(clip.startMs / 1000 + 0.3);
  await video.evaluate((v: HTMLVideoElement, end: number) => {
    v.currentTime = end - 0.1;
  }, clip.endMs / 1000);
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(true);
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeCloseTo(clip.startMs / 1000, 1);
});
