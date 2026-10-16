import { expect, test } from "@playwright/test";
const settings = {
  brand: "demo",
  aiProvider: "anthropic",
  count: 0,
  minSeconds: 20,
  maxSeconds: 90,
  criterion: "auto",
  instructions: "",
  cut: "normal",
  zoom: false,
  subtitles: {
    style: "karaoke",
    size: 64,
    position: "bottom",
    maxWords: 4,
    uppercase: false,
  },
  music: "",
  musicVolume: 0.07,
};
test("Clips has independent settings, fixed vertical output and a 90 second limit", async ({
  page,
}) => {
  await page.route("**/api/brands", (r) =>
    r.fulfill({ json: { brands: [{ slug: "demo", name: "Mi marca" }] } }),
  );
  await page.route("**/api/music", (r) => r.fulfill({ json: { tracks: [] } }));
  await page.route("**/api/clips", (r) =>
    r.fulfill({ json: { jobs: [], capabilities: { tracking: true } } }),
  );
  await page.goto("/clips");
  await expect(
    page.getByRole("heading", { name: "Clips", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Vertical 9:16 · hasta 90 s")).toBeVisible();
  await expect(page.getByLabel("Duración máxima (segundos)")).toHaveValue("90");
  await expect(page.getByLabel("Duración máxima (segundos)")).toHaveAttribute(
    "max",
    "90",
  );
  await expect(
    page.getByRole("link", { name: "Edición", exact: true }),
  ).toHaveAttribute("href", "/");
  await expect(
    page.getByRole("link", { name: "Clips", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("button", { name: "Analizar y proponer clips" }),
  ).toBeDisabled();
  await page.screenshot({ path: "/tmp/clips-config.png", fullPage: true });
});
test("review edits and selection are sent only to the Clips API", async ({
  page,
}) => {
  const id = "c-12345678-1234-1234-1234-123456789abc";
  const clip = {
    id: "clip-1",
    title: "Una idea",
    reason: "Tiene contexto y cierre.",
    startMs: 0,
    endMs: 80000,
    selected: true,
  };
  await page.route(`**/api/clips/${id}`, async (r) => {
    if (r.request().method() === "POST") {
      const body = r.request().postDataJSON();
      expect(body.action).toBe("render");
      expect(body.clips[0].endMs).toBe(90000);
      await r.fulfill({ json: { ok: true } });
    } else
      await r.fulfill({
        json: {
          job: {
            schema: "clips-v2",
            id,
            title: "Entrevista",
            source: "source.mp4",
            durationMs: 300000,
            settings,
            clips: [clip],
            step: "review",
            message: "Revisá las propuestas.",
          },
          running: false,
          interrupted: false,
        },
      });
  });
  await page.route("**/file/source.mp4", (r) => r.fulfill({ status: 404 }));
  await page.goto(`/clips/${id}`);
  await page.getByLabel("Final clip 1").fill("90");
  await page.waitForTimeout(2200);
  await expect(page.getByLabel("Final clip 1")).toHaveValue("90");
  const request = page.waitForRequest(
    (r) => r.url().endsWith(`/api/clips/${id}`) && r.method() === "POST",
  );
  await page.getByRole("button", { name: "Renderizar seleccionados" }).click();
  await request;
});

test("real API rejects a video longer than 15 minutes before starting AI", async ({
  request,
}) => {
  const fs = await import("node:fs");
  test.skip(
    !fs.existsSync("/tmp/clips-too-long.mp4"),
    "Generate the synthetic duration fixture first",
  );
  const before = await (await request.get("/api/clips")).json();
  const brands = await (await request.get("/api/brands")).json();
  test.skip(!brands.brands?.length, "Requires a local saved brand");
  const response = await request.post("/api/clips", {
    headers: {
      "x-filename": "synthetic-too-long.mp4",
      "x-settings": encodeURIComponent(
        JSON.stringify({ ...settings, brand: brands.brands[0].slug }),
      ),
    },
    data: fs.readFileSync("/tmp/clips-too-long.mp4"),
  });
  expect(response.status()).toBe(400);
  expect((await response.json()).error).toContain("15 minutos");
  const after = await (await request.get("/api/clips")).json();
  expect(after.jobs.map((j: { id: string }) => j.id)).toEqual(
    before.jobs.map((j: { id: string }) => j.id),
  );
});

test("real API protects internal job files and supports video byte ranges", async ({
  request,
}) => {
  const jobs = await (await request.get("/api/clips")).json();
  const job = jobs.jobs.find(
    (j: { title: string }) => j.title === "Prueba técnica Clips (8 s)",
  );
  test.skip(!job, "Requires the isolated smoke job");
  expect(
    (await request.get(`/api/clips/${job.id}/file/job.json`)).status(),
  ).toBe(404);
  const media = await request.get(
    `/api/clips/${job.id}/file/${job.clips[0].file}`,
    { headers: { Range: "bytes=0-99" } },
  );
  expect(media.status()).toBe(206);
  expect((await media.body()).length).toBe(100);
  const bad = await request.post(`/api/clips/${job.id}`, {
    data: { action: "render", clips: [{ ...job.clips[0], endMs: 91000 }] },
  });
  expect(bad.status()).toBe(400);
});
