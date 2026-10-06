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

  const yaExiste = brands?.some((b) => b.name.trim().toLowerCase() === actual.trim().toLowerCase());

  return (
    <Panel
      title="Marcas guardadas"
      right={
        <Button onClick={() => void llamar({ action: "guardar" }, `Marca guardada: ${actual}.`)} disabled={busy || pendiente}>
          {busy ? <Spinner /> : null}
          {yaExiste ? "Actualizar esta marca" : "Guardar la marca actual"}
        </Button>
      }
    >
      <div className="flex flex-col gap-2">
        {pendiente ? (
          <p className="text-[12px] text-amber-300">
            Tenés cambios sin guardar: tocá “Guardar cambios” arriba y después guardala como marca.
          </p>
        ) : null}

        {brands === null ? (
          <p className="flex items-center gap-2 text-[13px] text-neutral-500">
            <Spinner /> Cargando…
          </p>
        ) : brands.length === 0 ? (
          <p className="text-[13px] text-neutral-500">
            Todavía no guardaste ninguna. Guardá la marca actual y después vas a poder cambiar entre una y otra con un
            toque: colores, tipografías y logo.
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
