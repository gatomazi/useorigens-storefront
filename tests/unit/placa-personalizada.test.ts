import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import sharp from "sharp";
import { artworkFields, composeArtwork, fieldDisplay, fieldEdits, fieldsCopy, fieldsSummary, plateValue, typedPlate, validateArtworkFields } from "@/lib/customization/artwork";
import { needsReview } from "@/lib/customization/review-words";
import { cityValue, exactCity, parseCityValue, searchCities, type BrazilCity } from "@/lib/geo/brazil-cities";
import { parseProjectFile, type PrintProject } from "@/lib/print-studio/model";
import { renderProjectPng } from "@/lib/print-studio/render-server";

const ROWS = JSON.parse(readFileSync(path.join(process.cwd(), "data", "geo", "municipios-brasil.json"), "utf8")) as [string, string, string][];
const CITIES: BrazilCity[] = ROWS.map(([id, name, uf]) => ({ id, name, uf }));
const exists = (value: string) => CITIES.some((c) => cityValue(c) === value);
const FONT = `data:font/ttf;base64,${readFileSync(path.join(process.cwd(), "assets", "print-studio", "fonts", "OrigensPlaca-Regular.ttf")).toString("base64")}`;

const text = (id: string, y: number, slot: Record<string, unknown>) => ({ kind: "text", id, name: id, visible: true, x: 100, y, text: "X", fontId: "font-origens-placa", fontSize: 120, weight: 400, color: "#b6bab5", letterSpacing: 4, lineHeight: 1.1, align: "center", boxWidth: 1800, slot });
const project = (layers: unknown[]) => ({ version: 1, name: "Placa", width: 2000, height: 600, dpi: 300, background: null, reference: null, fonts: [{ id: "font-origens-placa", name: "Origens Placa", weight: 400, dataUrl: FONT }], layers });
const BASE = parseProjectFile(JSON.stringify(project([
  text("cidade", 80, { field: "cidade", label: "Cidade", template: "{cidade}", textCase: "upper", maxLength: 60, example: "Santa Terezinha de Itaipu/PR", input: "city" }),
  text("placa", 300, { field: "placa", label: "Placa", template: "{placa}", textCase: "upper", maxLength: 8, example: "TOM-1996", input: "plate" }),
])));

describe("the plate base", () => {
  test("the studio keeps the kind of each field, and refuses an unknown one", () => {
    expect(artworkFields(BASE).map((f) => [f.id, f.input])).toEqual([["cidade", "city"], ["placa", "plate"]]);
    expect(() => parseProjectFile(JSON.stringify(project([text("x", 80, { field: "x", label: "X", template: "{x}", textCase: "upper", maxLength: 8, example: "A", input: "cep" })])))).toThrow(/campo de personalização inválido/);
  });
  test("prints the city as UF - NOME and the plate as ABC-1234", () => {
    expect(fieldEdits(BASE, { cidade: "Santa Terezinha de Itaipu/PR", placa: "tom1996" }).map((e) => e.text)).toEqual(["PR - SANTA TEREZINHA DE ITAIPU", "TOM-1996"]);
  });
  test("draws with the embedded font on the server", async () => {
    const png = await renderProjectPng(composeArtwork(BASE, fieldEdits(BASE, { cidade: "Belém/PA", placa: "BEL-1616" })), 1000);
    const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let ink = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 128) ink++;
    expect(ink).toBeGreaterThan(1000);
  });
});

describe("plate answers", () => {
  test("letters and digits in any shape become ABC-1234; anything else is refused", () => {
    expect(["tom1996", "TOM-1996", " tom 1996 ", "t.o.m-1-9-9-6"].map(plateValue)).toEqual(["TOM-1996", "TOM-1996", "TOM-1996", "TOM-1996"]);
    expect(["TO-1996", "TOMA-196", "1996-TOM", "TOM-19967", "ÇÃO-1996", ""].map(plateValue)).toEqual([null, null, null, null, null, null]);
  });
  test("typing keeps letters where letters go and digits where digits go, and the preview follows", () => {
    expect(["a", "abc", "abc1", "ABC-", "1t2o3m", "tom1996", "tom19967", "TOM-AZI", "abcd1234", "ab12c"].map(typedPlate)).toEqual(["A", "ABC", "ABC-1", "ABC-", "TOM", "TOM-1996", "TOM-1996", "TOM-", "ABC-1234", "ABC"]);
    expect(fieldEdits(BASE, { cidade: "Belém/PA", placa: "ABC-12" }).map((e) => e.text)).toEqual(["PA - BELÉM", "ABC-12"]);
  });
  test("the server keeps the canonical plate", () => {
    const ok = validateArtworkFields(BASE, "t", { cidade: "Belém/PA", placa: "bel 1616" }, { cityExists: exists });
    expect(ok.ok && ok.artwork.fields).toEqual([{ id: "cidade", label: "Cidade", value: "Belém/PA" }, { id: "placa", label: "Placa", value: "BEL-1616" }]);
    const bad = validateArtworkFields(BASE, "t", { cidade: "Belém/PA", placa: "BE-16" });
    expect(!bad.ok && bad.errors).toEqual([{ key: "artwork.placa", message: "Placa: use 3 letras e 4 números, como ABC-1234" }]);
  });
  test("offensive 3-letter plates go to the team; ordinary ones do not", () => {
    expect(["FDP-1234", "PQP-2020", "VSF-0001", "PAU-1999"].map(needsReview)).toEqual([true, true, true, true]);
    expect(["TOM-1996", "ABC-1234", "BEL-1616", "CUS-2000"].map(needsReview)).toEqual([false, false, false, false]);
  });
});

describe("city answers", () => {
  test("every municipality of IBGE fits the field and prints", () => {
    expect(CITIES.length).toBeGreaterThan(5500);
    for (const city of CITIES) {
      expect(parseCityValue(cityValue(city)), cityValue(city)).toEqual({ name: city.name, uf: city.uf });
      expect([...cityValue(city)].length).toBeLessThanOrEqual(60);
    }
  });
  test("only a city of the list passes the server, and its answer passes again when the art is drawn", () => {
    const ok = validateArtworkFields(BASE, "t", { cidade: "Santa Terezinha de Itaipu/PR", placa: "TOM-1996" }, { cityExists: exists });
    expect(ok.ok).toBe(true);
    const again = ok.ok && validateArtworkFields(BASE, "t", Object.fromEntries(ok.artwork.fields!.map((f) => [f.id, f.value])), { cityExists: exists });
    expect(again && again.ok && again.artwork.layers.map((l) => l.text)).toEqual(["PR - SANTA TEREZINHA DE ITAIPU", "TOM-1996"]);
    for (const wrong of ["Santa Terezinha do Itaipu/PR", "Curitiba/SC", "Curitiba", "Curitiba/XX", ""]) {
      const r = validateArtworkFields(BASE, "t", { cidade: wrong, placa: "TOM-1996" }, { cityExists: exists });
      expect(!r.ok && r.errors[0], wrong).toEqual({ key: "artwork.cidade", message: "Cidade: escolha a cidade na lista" });
    }
  });
  test("the search ignores accents and case and puts names starting with the text first", () => {
    expect(searchCities(CITIES, "SC", "sao jose").map((c) => c.name).slice(0, 3)).toEqual(["São José", "São José do Cedro", "São José do Cerrito"]);
    expect(searchCities(CITIES, "PR", "itaipu").map((c) => c.name)).toContain("Santa Terezinha de Itaipu");
    expect(searchCities(CITIES, "PR", "cur").map((c) => c.name)[0]).toBe("Curitiba");
    expect(searchCities(CITIES, "PR", "xyzw")).toEqual([]);
    expect(exactCity(CITIES, "PA", "belem")?.name).toBe("Belém");
  });
  test("reads well to the customer and the team", () => {
    expect(fieldDisplay({ input: "city" }, "Santa Terezinha de Itaipu/PR")).toBe("Santa Terezinha de Itaipu (PR)");
    expect(fieldsSummary(BASE, { cidade: "Belém/PA", placa: "BEL-1616" })).toBe("Belém (PA) · BEL-1616");
    expect(fieldsCopy(BASE).legend).toBe("Personalize a estampa");
  });
});

describe("the surname bases keep their words", () => {
  test("a base of free names still speaks of the surname", () => {
    const surname = parseProjectFile(JSON.stringify(project([text("sobrenome", 80, { field: "sobrenome", label: "Sobrenome da família", template: "{sobrenome}", textCase: "upper", maxLength: 20, example: "Silva" })])));
    expect(fieldsCopy(surname)).toMatchObject({ legend: "Escreva o sobrenome", check: "Conferi a escrita do sobrenome" });
    expect(fieldsSummary(surname, { sobrenome: "  dos   Santos " })).toBe("dos Santos");
    expect((surname as PrintProject).layers).toHaveLength(1);
  });
});
