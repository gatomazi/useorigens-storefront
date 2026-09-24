"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const FILTERS = [
  ["all", "Todas"],
  ["public", "Públicas na INK"],
  ["internal", "Internas / ocultas"],
  ["enabled", "Habilitadas no CMS"],
  ["empty", "Sem produtos elegíveis"],
] as const;

/** The Library's search box and filter chips. The URL is the state (so reload, back and the server-rendered rows agree); typing is debounced. */
export function LibrarySearch({ q, f }: { q: string; f: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function go(next: { q?: string; f?: string }) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    p.delete("ok");
    p.delete("err");
    router.replace(`/admin/colecoes${p.size ? `?${p}` : ""}`, { scroll: false });
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="a-label" htmlFor="library-q">Buscar por nome, slug ou número (sem se preocupar com acentos)</label>
        <input
          id="library-q"
          type="search"
          value={value}
          placeholder="Ex.: fala, territ, 152188…"
          className="a-input"
          onChange={(e) => {
            setValue(e.target.value);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => go({ q: e.target.value.trim() }), 200);
          }}
        />
      </div>
      <div role="group" aria-label="Filtros" className="flex flex-wrap gap-2">
        {FILTERS.map(([key, label]) => (
          <button key={key} type="button" aria-pressed={f === key} onClick={() => go({ f: key === "all" ? "" : key })} className={`a-btn sm ${f === key ? "" : "ghost"}`}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
