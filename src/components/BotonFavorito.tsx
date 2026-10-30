import { alternarFavorito, useFavoritos } from "../lib/favoritos";
import { track } from "../lib/analitica";

interface Props {
  slug: string;
  titulo: string;
  /** Con texto visible ("Guardar") en la página del plan; solo icono en las tarjetas. */
  conTexto?: boolean;
  class?: string;
}

export default function BotonFavorito({ slug, titulo, conTexto = false, class: clase = "" }: Props) {
  const activo = useFavoritos().includes(slug);
  return (
    <button
      type="button"
      aria-pressed={activo}
      aria-label={activo ? `Quitar ${titulo} de mi lista` : `Guardar ${titulo} en mi lista`}
      onClick={() => track("favorito", { accion: alternarFavorito(slug).includes(slug) ? "agregar" : "quitar" })}
      class={`inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full font-bold transition ${conTexto ? "btn" : "text-white"} ${clase}`}
      style={conTexto ? undefined : { background: "var(--velo)" }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill={activo ? "var(--acento)" : "none"} stroke={activo ? "var(--acento)" : "currentColor"} stroke-width="2" stroke-linejoin="round">
        <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.7 5 6.1 5c2 0 3.2 1.1 3.9 2.2h4C14.7 6.1 15.9 5 17.9 5c3.4 0 5.2 3.4 3.7 6.8C19.5 16.4 12 21 12 21z" transform="translate(0 -1)" />
      </svg>
      {conTexto && <span>{activo ? "En mi lista" : "Guardar"}</span>}
    </button>
  );
}
