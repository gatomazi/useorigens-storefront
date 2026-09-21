import { describe, expect, test } from "vitest";
import { parseProductName, resolveCity } from "@/lib/catalog/parse";
import { product } from "./fixtures";

function cityDesign(name: string) {
  const parsed = parseProductName(name);
  if (parsed.kind !== "city-design") throw new Error(`expected city-design for "${name}"`);
  return parsed;
}

describe("parseProductName", () => {
  test("given a standard pipe name, when parsed, then family, variant, title and UF are extracted", () => {
    const parsed = cityDesign("Tijucas | Traço SC");
    expect(parsed).toMatchObject({ family: "traco", variant: "base", title: "Tijucas", uf: "SC" });
  });

  test("given a Sul coordinates name without UF, when parsed, then UF is null", () => {
    expect(cityDesign("Tijucas | Coordenadas")).toMatchObject({ family: "coordenadas", uf: null });
  });

  test("given Norte-style Feito Em with UF, when parsed, then UF comes from the suffix", () => {
    expect(cityDesign("Feito Em Xambioá - TO")).toMatchObject({ family: "feito-em", title: "Xambioá", uf: "TO" });
  });

  test("given Sul-style Feito em without UF, when parsed, then UF is null", () => {
    expect(cityDesign("Feito em Tijucas do Sul")).toMatchObject({ family: "feito-em", title: "Tijucas do Sul", uf: null });
  });

  test("given an Origem variant label, when parsed, then the variant key is normalized", () => {
    expect(cityDesign("Pato Branco | Origem Regional PR")).toMatchObject({ family: "ponto-de-origem", variant: "regional" });
  });

  test("given feminine and masculine custom labels, when parsed, then both collapse to one key", () => {
    expect(cityDesign("Reserva do Iguaçu | Origem Personalizada PR").variant).toBe("personalizado");
    expect(cityDesign("Amurel | Origem Personalizado SC").variant).toBe("personalizado");
  });

  test("given a UF embedded in the label, when parsed, then the UF is lifted out of the variant", () => {
    const parsed = cityDesign("Canabarro | Origem RS Personalizado");
    expect(parsed).toMatchObject({ variant: "personalizado", uf: "RS" });
  });

  test("given Essencia, when parsed, then it is kept as unclassified and never assigned to a family", () => {
    expect(parseProductName("Curitibaninha Paranaense | Essencia PR").kind).toBe("unclassified");
  });

  test("given art prints, pockets, state lines and DDD products, when parsed, then they are other merchandise", () => {
    for (const name of ["Gaúcho de Pedra", "Capivara da Praia — Pocket", "Made in Acre Clean", "TO | Minimal", "Marajó | 091", "Tijucas | São Sebastião"]) {
      expect(parseProductName(name).kind).toBe("other");
    }
  });
});

describe("resolveCity", () => {
  test("given a UF-less Feito em unique within the Sul, when resolved, then the city is found", () => {
    const parsed = cityDesign("Feito em Tijucas");
    const result = resolveCity(parsed, product("Feito em Tijucas"));
    expect(result).toMatchObject({ ok: true, city: { name: "Tijucas", uf: "SC" } });
  });

  test("given a UF-less name that exists in two Sul states, when resolved, then it is ambiguous and not guessed", () => {
    const parsed = cityDesign("Feito em Turvo");
    expect(resolveCity(parsed, product("Feito em Turvo"))).toMatchObject({ ok: false, reason: "ambiguous-city" });
  });

  test("given the same name with an explicit UF, when resolved, then the stated UF wins", () => {
    const parsed = cityDesign("Turvo | Traço SC");
    expect(resolveCity(parsed, product("Turvo | Traço SC"))).toMatchObject({ ok: true, city: { uf: "SC" } });
  });

  test("given a UF outside the store's region, when resolved, then it is rejected", () => {
    const parsed = cityDesign("Curitiba | Traço PR");
    const wrongStore = product("Curitiba | Traço PR", { storeKey: "use-norte" });
    expect(resolveCity(parsed, wrongStore)).toMatchObject({ ok: false, reason: "uf-mismatch" });
  });

  test("given a gentilic, when resolved, then the municipality comes from the first tag", () => {
    const parsed = cityDesign("Tijuquense | Gentilico SC");
    expect(resolveCity(parsed, product("Tijuquense | Gentilico SC", { tags: ["tijucas"] }))).toMatchObject({
      ok: true,
      city: { name: "Tijucas" },
    });
  });

  test("given a locality with the parent city in the tag, when resolved, then it binds to the municipality as a locality", () => {
    const parsed = cityDesign("Praia Paraíso | Origem Localidade RS");
    const result = resolveCity(parsed, product("Praia Paraíso | Origem Localidade RS", { tags: ["Torres"] }));
    expect(result).toMatchObject({ ok: true, city: { name: "Torres", uf: "RS" }, localityLabel: "Praia Paraíso" });
  });

  test("given a locality with no resolvable parent, when resolved, then it is not found and never invented as a city", () => {
    const parsed = cityDesign("Votouro | Origem Localidade RS");
    expect(resolveCity(parsed, product("Votouro | Origem Localidade RS"))).toMatchObject({ ok: false, reason: "city-not-found" });
  });

  test("given a Federal District administrative region, when resolved, then it is a locality of Brasília", () => {
    const parsed = cityDesign("Taguatinga | Origem DF");
    const result = resolveCity(parsed, product("Taguatinga | Origem DF", { storeKey: "use-centro" }));
    expect(result).toMatchObject({ ok: true, city: { name: "Brasília" }, localityLabel: "Taguatinga" });
  });
});
