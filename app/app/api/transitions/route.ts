import { TRANSITIONS } from "@/lib/transitions";
import { readTransitionsOff, writeTransitionsOff } from "@/lib/server/transitions";

export const dynamic = "force-dynamic";

/** Qué transiciones están apagadas (la IA no las usa al armar el plan). */
export async function GET() {
  return Response.json({ off: readTransitionsOff() });
}

/** Prende o apaga una: { id, on }. */
export async function POST(req: Request) {
  const { id, on } = (await req.json()) as { id?: string; on?: boolean };
  if (!id || !TRANSITIONS.some((t) => t.id === id)) return Response.json({ error: "No existe esa transición" }, { status: 400 });
  const off = readTransitionsOff().filter((x) => x !== id);
  writeTransitionsOff(on ? off : [...off, id]);
  return Response.json({ off: readTransitionsOff() });
}
