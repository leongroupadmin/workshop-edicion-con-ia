import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

test("deleting a video requires confirmation, reports errors and removes only that card", async ({
  page,
}) => {
  const jobs = [1, 2].map((n) => ({
    id: `video-${n}`,
    title: `Video ${n}`,
    durationMs: 60000,
    clips: [],
    message: "Listo",
  }));
  await page.route("**/api/brands", (r) => r.fulfill({ json: { brands: [] } }));
  await page.route("**/api/music", (r) => r.fulfill({ json: { tracks: [] } }));
  await page.route("**/api/clips", (r) =>
    r.fulfill({ json: { jobs, capabilities: { tracking: true } } }),
  );
  let calls = 0;
  let status = 409;
  await page.route("**/api/clips/video-1", (r) => {
    expect(r.request().method()).toBe("DELETE");
    calls++;
    return r.fulfill({
      status,
      json:
        status === 200
          ? { ok: true }
          : { error: "Esperá a que termine el procesamiento." },
    });
  });
  await page.goto("/clips");
  const remove = page.getByRole("button", {
    name: "Eliminar video: Video 1",
    exact: true,
  });
  page.once("dialog", (dialog) => dialog.dismiss());
  await remove.click();
  expect(calls).toBe(0);
  await expect(remove).toBeVisible();
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("todos sus clips renderizados");
    await dialog.accept();
  });
  await remove.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Esperá a que termine" }),
  ).toContainText("Esperá a que termine");
  await expect(remove).toBeEnabled();
  status = 200;
  page.once("dialog", (dialog) => dialog.accept());
  await remove.click();
  await expect(remove).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Eliminar video: Video 2" }),
  ).toBeVisible();
});

test("DELETE protects running jobs and removes only the requested Clips directory", async ({
  request,
}) => {
  const id = `c-${randomUUID()}`;
  const sibling = `c-${randomUUID()}`;
  const root = path.resolve(process.cwd(), "../clips");
  const dir = path.join(root, id);
  const other = path.join(root, sibling);
  try {
    for (const [folder, jobId] of [
      [dir, id],
      [other, sibling],
    ]) {
      fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(
        path.join(folder, "job.json"),
        JSON.stringify({
          schema: "clips-v2",
          id: jobId,
          createdAt: new Date().toISOString(),
          title: "Prueba de eliminación",
          clips: [],
          durationMs: 1000,
          message: "Listo",
          step: "done",
        }),
      );
      fs.writeFileSync(path.join(folder, "source.mp4"), "test fixture");
    }
    fs.writeFileSync(path.join(dir, ".lock"), String(process.pid));
    expect((await request.delete(`/api/clips/${id}`)).status()).toBe(409);
    expect(fs.existsSync(path.join(dir, "source.mp4"))).toBe(true);
    fs.unlinkSync(path.join(dir, ".lock"));
    expect((await request.delete(`/api/clips/${id}`)).status()).toBe(200);
    expect(fs.existsSync(dir)).toBe(false);
    expect(fs.existsSync(path.join(other, "source.mp4"))).toBe(true);
    expect((await request.get(`/api/clips/${id}`)).status()).toBe(404);
    expect((await request.delete(`/api/clips/${id}`)).status()).toBe(404);
    expect((await request.delete("/api/clips/not-a-clip")).status()).toBe(404);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(other, { recursive: true, force: true });
  }
});
