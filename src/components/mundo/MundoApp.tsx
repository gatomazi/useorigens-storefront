"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { trackMundo, type MundoCampos } from "@/lib/analytics/track";
import { MundoMarkup } from "./MundoMarkup";
import "./mundo.css";

/**
 * Meu Pequeno Mundo inside the storefront: the server sends the markup ready (MundoMarkup), and the experience (experiencia/app.js, with
 * Three.js in its own lazily loaded chunks) takes the DOM over after hydration. Nothing of it is imported by any other page.
 *
 * The address bar is cleaned in the first commit — before any analytics script can read it — because a shared world carries the visitor's
 * places (and, when they chose so, their memories) in the query string. The original query is handed to the experience instead.
 */
export function MundoApp({ lojaHref }: { lojaHref: string }) {
  const consulta = useRef<string | null>(null);
  const [falhou, setFalhou] = useState(false);

  useLayoutEffect(() => {
    if (consulta.current !== null) return; // Strict Mode runs effects twice; the first run already captured and cleaned it
    consulta.current = window.location.search;
    if (window.location.search) window.history.replaceState(window.history.state, "", window.location.pathname);
  }, []);

  useEffect(() => {
    let vivo = true;
    import("./experiencia/app.js").then(({ iniciarMundo }) => {
      if (!vivo) return;
      iniciarMundo({
        dados: { base: "/api/mundo/", indice: "indice", lugar: (chave: string) => `lugares/${chave}.json` },
        contexto: "/api/mundo/perfis",
        registrar: (evento: string, campos: MundoCampos) => trackMundo(evento, campos),
        urlNaBarra: false,
        lojaHref,
        consulta: consulta.current ?? "",
      });
    }).catch(() => {
      // the experience's own chunk did not arrive (network, deploy in between): say so instead of an endless "Preparando a maquete…"
      if (vivo) setFalhou(true);
    });
    return () => {
      vivo = false;
    };
  }, [lojaHref]);

  return (
    <>
      <MundoMarkup />
      {falhou && (
        <div role="alert" className="mpm-falha">
          <p>Não foi possível abrir o Meu Pequeno Mundo agora.</p>
          <p>
            <button type="button" onClick={() => window.location.reload()}>Tentar de novo</button>
            <a href={lojaHref}>Voltar à loja</a>
          </p>
        </div>
      )}
    </>
  );
}
