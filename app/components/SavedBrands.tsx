"use client";

import { useEffect, useState } from "react";
import { Button, ConfirmDialog, Panel, Spinner, TrashIcon } from "@/components/ui";
import { api } from "@/lib/client";
import type { Brand } from "@/lib/types";

type SavedBrand = Brand & { slug: string };

const Muestra = ({ colors }: { colors: Brand["colors"] }) => (
  <span className="flex shrink-0 overflow-hidden rounded-md border border-line">
    {([colors.background, colors.primary, colors.secondary, colors.highlight] as const).map((c, i) => (
      <span key={i} className="h-7 w-3.5" style={{ background: c }} />
    ))}
  </span>
);

/**
 * Biblioteca de marcas: guardar la que está en uso y volver a cualquiera.
 * Cada marca guarda sus colores, sus tipografías y su logo.
 */
export const SavedBrands = ({
  actual,
  pendiente,
  onUsar,
}: {
  /** Nombre de la marca en uso (para el botón de guardar). */
  actual: string;
  /** Hay cambios sin guardar en la marca en uso. */
  pendiente: boolean;
  /** Se cambió la marca en uso: la página vuelve a cargarla. */
  onUsar: () => void | Promise<void>;
}) => {
  const [brands, setBrands] = useState<SavedBrand[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [borrar, setBorrar] = useState<SavedBrand | null>(null);
  // Nombre con el que se va a guardar. Arranca con el de la marca en uso,
  // pero se puede cambiar para guardar una marca nueva sin tocar la actual.
  const [nombre, setNombre] = useState(actual);
  const [tocado, setTocado] = useState(false);

  const cargar = async () => {
    try {
      const r = await api<{ brands: SavedBrand[] }>("/api/brands");
      setBrands(r.brands);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pude leer las marcas.");
    }
  };
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial
    void cargar();
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seguir a la marca en uso mientras no escriban
    if (!tocado) setNombre(actual);
  }, [actual, tocado]);

  const llamar = async (body: Record<string, string>, ok: string, despues?: () => void | Promise<void>) => {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const r = await api<{ brands: SavedBrand[] }>("/api/brands", { method: "POST", body: JSON.stringify(body) });
      setBrands(r.brands);
      setMsg(ok);
      await despues?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo.");
    } finally {
      setBusy(false);
    }
  };

  const limpio = nombre.trim();
  const existente = brands?.find((b) => b.name.trim().toLowerCase() === limpio.toLowerCase());

  const guardar = async () => {
    await llamar(
      { action: "guardar", name: limpio },
      existente ? `Actualizada: ${limpio}.` : `Guardada como ${limpio}. Seguís usando ${actual}.`,
    );
    setTocado(false);
  };

  return (
    <Panel title="Marcas guardadas">
      <div className="flex flex-col gap-2">
        <label className="text-[11px] uppercase tracking-wide text-neutral-500">
          Guardar lo que estás usando ahora como:
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={nombre}
            onChange={(e) => {
              setNombre(e.target.value);
              setTocado(true);
            }}
            onKeyDown={(e) => e.key === "Enter" && limpio && !busy && !pendiente && void guardar()}
            maxLength={60}
            placeholder="nombre de la marca"
            className="min-w-[200px] flex-1 rounded-lg border border-line bg-black/30 px-3 py-1.5 text-[13px] outline-none"
          />
          <Button variant="primary" onClick={() => void guardar()} disabled={busy || pendiente || !limpio}>
            {busy ? <Spinner /> : null}
            Guardar marca
          </Button>
        </div>
        <p className="text-[11px] text-neutral-500">
          {existente
            ? `Ya tenés una marca con ese nombre: se va a reemplazar por la que estás usando.`
            : "Es una copia: la marca que estás usando ahora no se toca."}
        </p>

        {pendiente ? <p className="text-[12px] text-neutral-500">Esperá a que termine de guardarse la marca…</p> : null}

        {brands === null ? (
          <p className="flex items-center gap-2 text-[13px] text-neutral-500">
            <Spinner /> Cargando…
          </p>
        ) : brands.length === 0 ? (
          <p className="text-[13px] text-neutral-500">
            Todavía no guardaste ninguna. Poné un nombre arriba y guardala: después vas a poder cambiar entre una y otra
            con un toque, con sus colores, tipografías y logo.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {brands.map((b) => (
              <li key={b.slug} className="flex items-center gap-2 rounded-lg border border-line bg-black/20 px-2 py-1.5">
                <Muestra colors={b.colors} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-neutral-200">{b.name}</span>
                  <span className="block truncate text-[11px] text-neutral-500">
                    {b.fonts.heading}
                    {b.fonts.body !== b.fonts.heading ? ` · ${b.fonts.body}` : ""}
                    {b.logo ? " · con logo" : ""}
                  </span>
                </span>
                <Button
                  disabled={busy}
                  onClick={() => void llamar({ action: "usar", slug: b.slug }, `Ahora usás ${b.name}.`, onUsar)}
                >
                  Usar
                </Button>
                <button
                  type="button"
                  aria-label={`Eliminar ${b.name}`}
                  onClick={() => setBorrar(b)}
                  className="shrink-0 text-neutral-500 hover:text-red-300"
                >
                  <TrashIcon />
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="text-[11px] text-neutral-500">
          “Usar” reemplaza la marca en uso por la guardada. Los videos ya renderizados no cambian; los que armes después
          salen con la marca nueva.
        </p>
        {msg ? <p className="text-[12px] text-emerald-300">{msg}</p> : null}
        {error ? <p className="text-[12px] text-red-300">{error}</p> : null}
      </div>

      {borrar ? (
        <ConfirmDialog
          title={`¿Eliminar la marca “${borrar.name}”?`}
          confirmLabel="Eliminar marca"
          onClose={() => setBorrar(null)}
          onConfirm={async () => {
            const r = await api<{ brands: SavedBrand[] }>(`/api/brands?slug=${encodeURIComponent(borrar.slug)}`, {
              method: "DELETE",
            });
            setBrands(r.brands);
            setMsg(`Eliminada: ${borrar.name}.`);
            setBorrar(null);
          }}
        >
          Se borra la copia guardada (colores, tipografías y logo). La marca que estás usando ahora no se toca.
          <br />
          Va a la <b className="text-neutral-200">Papelera de tu Mac</b>: si te arrepentís, la recuperás desde ahí.
        </ConfirmDialog>
      ) : null}
    </Panel>
  );
};
