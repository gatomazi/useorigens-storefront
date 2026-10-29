"use client";

import { useEffect, useId, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { BRAZIL_UF_NAMES, BRAZIL_UFS, cityValue, exactCity, loadBrazilCities, parseCityValue, searchCities, type BrazilCity } from "@/lib/geo/brazil-cities";
import styles from "./ArtworkEditor.module.css";

/**
 * A city of Brazil for a print ("PR - SANTA TEREZINHA DE ITAIPU"): the state first, then the city with autocomplete (an ARIA combobox; no
 * `<datalist>`, unreliable on iOS and in the Instagram browser). The answer is "Nome/UF" and exists only once a city of the list is picked;
 * a full name typed without picking counts when the field is left. The list (IBGE, ~50 KB) loads only where this field is shown.
 */
export function CityField({ id, label, tip, value, onChange, error, describedBy }: { id: string; label: string; tip?: ReactNode; value: string; onChange: (value: string) => void; error?: string; describedBy: string }) {
  const listId = useId();
  const picked = parseCityValue(value);
  const [uf, setUf] = useState(picked?.uf ?? "");
  const [query, setQuery] = useState(picked?.name ?? "");
  const [cities, setCities] = useState<BrazilCity[] | null>(null);
  // The list comes as a separate download: on a weak phone connection it can fail, and the customer can try again.
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    let live = true;
    loadBrazilCities().then((list) => live && setCities(list), () => live && setFailed(true));
    return () => { live = false; };
  }, [attempt]);
  const retry = () => { setFailed(false); setAttempt((n) => n + 1); };
  // The same answer is shown in the page and in the full-screen view: a city picked in one shows in the other.
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    if (picked) {
      setUf(picked.uf);
      setQuery(picked.name);
    }
  }

  const options = useMemo(() => (cities && uf && query.trim() ? searchCities(cities, uf, query) : []), [cities, uf, query]);
  const pick = (city: BrazilCity) => {
    setQuery(city.name);
    setOpen(false);
    onChange(cityValue(city));
  };
  const type = (text: string) => {
    setQuery(text);
    setOpen(true);
    setActive(0);
    if (value) onChange("");
  };
  const leave = () => {
    setOpen(false);
    if (!value && cities && uf) {
      const city = exactCity(cities, uf, query);
      if (city) pick(city);
    }
  };
  const keys = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      if (options.length) setActive((i) => (i + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
    } else if (e.key === "Enter" && open && options[active]) {
      e.preventDefault();
      pick(options[active]);
    } else if (e.key === "Escape") setOpen(false);
  };
  const showList = open && query.trim() !== "" && !value;

  return (
    <div className={styles.city}>
      <div>
        <label className="t-label" htmlFor={`${id}-uf`}>Estado</label>
        <select id={`${id}-uf`} className={styles.textarea} value={uf} onChange={(e) => { setUf(e.target.value); setQuery(""); onChange(""); requestAnimationFrame(() => document.getElementById(id)?.focus()); }}>
          <option value="">Escolha</option>
          {BRAZIL_UFS.map((u) => <option key={u} value={u}>{u} · {BRAZIL_UF_NAMES[u]}</option>)}
        </select>
      </div>
      {failed && (
        <p className={`${styles.error} ${styles.cityFailed}`} role="alert">
          Não foi possível carregar a lista de cidades. <button type="button" className="underline underline-offset-4" onClick={retry}>Tentar de novo</button>
        </p>
      )}
      <div className={styles.cityInput}>
        <div className="flex items-center"><label className="t-label" htmlFor={id}>{label}</label>{tip}</div>
        <input
          id={id}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && options[active] ? `${listId}-${active}` : undefined}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          value={query}
          disabled={!uf}
          onChange={(e) => type(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={leave}
          onKeyDown={keys}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={uf ? "Digite o nome da cidade" : "Escolha o estado primeiro"}
          className={styles.textarea}
        />
        {showList && (
          <ul id={listId} role="listbox" aria-label={`Cidades de ${BRAZIL_UF_NAMES[uf]}`} className={styles.cityList}>
            {!cities ? <li className={styles.cityEmpty}>{failed ? "A lista de cidades não carregou." : "Carregando as cidades…"}</li> : options.length ? options.map((city, i) => (
              // mousedown keeps the focus in the field, so the click still picks (on touch too).
              <li key={city.id} id={`${listId}-${i}`} role="option" aria-selected={i === active} className={styles.cityOption} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(city)}>
                {city.name}
              </li>
            )) : <li className={styles.cityEmpty}>Nenhuma cidade com “{query.trim()}” em {BRAZIL_UF_NAMES[uf]}.</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
