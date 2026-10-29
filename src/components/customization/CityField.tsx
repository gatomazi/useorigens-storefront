"use client";

import { useEffect, useId, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { BRAZIL_UF_NAMES, cityValue, exactCity, exactUf, loadBrazilCities, parseCityValue, searchCities, searchUfs, ufLabel, type BrazilCity } from "@/lib/geo/brazil-cities";
import styles from "./ArtworkEditor.module.css";

type Option = { key: string; label: string };

/**
 * A text field with suggestions underneath (an ARIA combobox; no `<datalist>`, unreliable on iOS and in the Instagram browser). The parent owns
 * the text and the options; picking sends the option, leaving the field lets the parent accept a full name typed without picking.
 */
function Combobox({ id, label, tip, query, onType, options, onPick, onLeave, listLabel, empty, openWhenEmpty = false, picked, disabled, placeholder, invalid, describedBy }: {
  id: string; label: string; tip?: ReactNode; query: string; onType: (text: string) => void; options: Option[]; onPick: (key: string) => void; onLeave: () => void;
  listLabel: string; empty: ReactNode; openWhenEmpty?: boolean; picked: boolean; disabled?: boolean; placeholder: string; invalid?: boolean; describedBy?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const pick = (option: Option) => { setOpen(false); onPick(option.key); };
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
  const showList = open && !picked && (openWhenEmpty || query.trim() !== "");
  return (
    <div className={styles.cityInput}>
      <div className="flex items-center"><label className="t-label" htmlFor={id}>{label}</label>{tip}</div>
      <input
        id={id}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && options[active] ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        value={query}
        disabled={disabled}
        onChange={(e) => { onType(e.target.value); setOpen(true); setActive(0); }}
        onFocus={(e) => { setOpen(true); if (picked) e.target.select(); }}
        onBlur={() => { setOpen(false); onLeave(); }}
        onKeyDown={keys}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder={placeholder}
        className={styles.textarea}
      />
      {showList && (
        <ul id={listId} role="listbox" aria-label={listLabel} className={styles.cityList}>
          {options.length ? options.map((option, i) => (
            // mousedown keeps the focus in the field, so the click still picks (on touch too).
            <li key={option.key} id={`${listId}-${i}`} role="option" aria-selected={i === active} className={styles.cityOption} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(option)}>
              {option.label}
            </li>
          )) : <li className={styles.cityEmpty}>{empty}</li>}
        </ul>
      )}
    </div>
  );
}

/**
 * A city of Brazil for a print ("PR - SANTA TEREZINHA DE ITAIPU"): the state, then the city, both typed with suggestions. The answer is "Nome/UF"
 * and exists only once a city of the list is picked; a full state or city name typed without picking counts when its field is left. The city
 * list (IBGE, ~50 KB) loads only where this field is shown.
 */
export function CityField({ id, label, tip, value, onChange, error, describedBy }: { id: string; label: string; tip?: ReactNode; value: string; onChange: (value: string) => void; error?: string; describedBy: string }) {
  const picked = parseCityValue(value);
  const [uf, setUf] = useState(picked?.uf ?? "");
  const [ufQuery, setUfQuery] = useState(picked ? ufLabel(picked.uf) : "");
  const [query, setQuery] = useState(picked?.name ?? "");
  const [cities, setCities] = useState<BrazilCity[] | null>(null);
  // The list comes as a separate download: on a weak phone connection it can fail, and the customer can try again.
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

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
      setUfQuery(ufLabel(picked.uf));
      setQuery(picked.name);
    }
  }

  const ufOptions = useMemo(() => searchUfs(uf ? "" : ufQuery).map((u) => ({ key: u, label: ufLabel(u) })), [uf, ufQuery]);
  const cityOptions = useMemo(() => (cities && uf && query.trim() ? searchCities(cities, uf, query).map((c) => ({ key: c.id, label: c.name })) : []), [cities, uf, query]);

  const pickUf = (next: string) => {
    setUf(next);
    setUfQuery(ufLabel(next));
    setQuery("");
    if (value) onChange("");
    requestAnimationFrame(() => document.getElementById(id)?.focus());
  };
  const typeUf = (text: string) => {
    setUfQuery(text);
    if (uf) { setUf(""); setQuery(""); }
    if (value) onChange("");
  };
  const pickCity = (city: BrazilCity) => {
    setQuery(city.name);
    onChange(cityValue(city));
  };
  const typeCity = (text: string) => {
    setQuery(text);
    if (value) onChange("");
  };

  return (
    <div className={styles.city}>
      <Combobox
        id={`${id}-uf`} label="Estado" query={ufQuery} onType={typeUf} options={ufOptions} onPick={pickUf} openWhenEmpty picked={Boolean(uf)}
        onLeave={() => { const typed = !uf && exactUf(ufQuery); if (typed) pickUf(typed); }}
        listLabel="Estados" empty={<>Nenhum estado com “{ufQuery.trim()}”.</>} placeholder="Digite o estado" />
      {failed && (
        <p className={`${styles.error} ${styles.cityFailed}`} role="alert">
          Não foi possível carregar a lista de cidades. <button type="button" className="underline underline-offset-4" onClick={retry}>Tentar de novo</button>
        </p>
      )}
      <Combobox
        id={id} label={label} tip={tip} query={query} onType={typeCity} options={cityOptions} picked={Boolean(value)} invalid={Boolean(error)} describedBy={describedBy}
        onPick={(key) => { const city = cities?.find((c) => c.id === key); if (city) pickCity(city); }}
        onLeave={() => { const typed = !value && cities && uf ? exactCity(cities, uf, query) : null; if (typed) pickCity(typed); }}
        listLabel={uf ? `Cidades de ${BRAZIL_UF_NAMES[uf]}` : "Cidades"}
        empty={!uf ? "Escolha o estado primeiro." : !cities ? (failed ? "A lista de cidades não carregou." : "Carregando as cidades…") : <>Nenhuma cidade com “{query.trim()}” em {BRAZIL_UF_NAMES[uf]}.</>}
        placeholder="Digite o nome da cidade" />
    </div>
  );
}
