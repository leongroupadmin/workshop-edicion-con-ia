import { addNote, deleteNote, editNote, readNotes } from "@/lib/server/notes";

export const dynamic = "force-dynamic";

const fallo = (e: unknown) =>
  Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });

/** GET: todas las anotaciones, la más nueva primero. */
export async function GET() {
  return Response.json({ notes: readNotes() });
}

/** POST: agrega una anotación, o edita una existente si viene `id`. */
export async function POST(req: Request) {
  const { text, id } = (await req.json().catch(() => ({}))) as { text?: string; id?: string };
  try {
    return Response.json({ notes: id ? editNote(id, text ?? "") : addNote(text ?? "") });
  } catch (e) {
    return fallo(e);
  }
}

/** DELETE ?id=…: borra una anotación. */
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Falta la anotación." }, { status: 400 });
  try {
    return Response.json({ notes: deleteNote(id) });
  } catch (e) {
    return fallo(e);
  }
}
