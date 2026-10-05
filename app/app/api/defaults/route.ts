import { exists, readDefaultSettings, readSettings, writeDefaultSettings } from "@/lib/server/projects";

export const dynamic = "force-dynamic";

/** Ajustes con los que arrancan los videos nuevos. */
export async function GET() {
  return Response.json(readDefaultSettings());
}

/** Guarda los ajustes de un proyecto como predeterminados para los videos nuevos. */
export async function POST(req: Request) {
  const { fromProject } = (await req.json()) as { fromProject?: string };
  if (!fromProject || !exists(fromProject)) return Response.json({ error: "No existe el proyecto" }, { status: 404 });
  const settings = readSettings(fromProject);
  writeDefaultSettings(settings);
  return Response.json({ settings });
}
