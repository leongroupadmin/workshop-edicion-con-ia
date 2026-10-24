import { PASO_LABELS, type ClonJob } from "@/lib/clon/types";

const CLASES: Record<ClonJob["paso"], string> = {
  listo: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  error: "border-red-500/30 bg-red-500/15 text-red-300",
  esperando_aprobacion: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  guion: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  generando: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  voz: "border-sky-500/30 bg-sky-500/10 text-sky-300",
};

/** Etiqueta del paso de un clon (amarilla para aprobar, verde listo, roja error). */
export const PasoClon = ({ job, trabajando }: { job: Pick<ClonJob, "paso" | "proyectoId">; trabajando?: boolean }) => (
  <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] ${CLASES[job.paso]}`}>
    {trabajando ? <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" /> : null}
    {job.proyectoId ? "En edición" : PASO_LABELS[job.paso]}
  </span>
);
