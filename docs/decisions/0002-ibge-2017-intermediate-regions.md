# 0002. Regional microcontext uses IBGE's 2017 division, not mesoregions

- Status: accepted (review gate of `/sul` V2)
- Supersedes: the mesoregion grouping introduced in V2 (documented in `docs/design/sul-v2-regional-plan.md`)

## Context

V2 grouped cities and wrote factual microcontext ("Santa Catarina · Grande Florianópolis") from the IBGE
**mesoregion** of each municipality, and labelled the state page grouping "Regiões oficiais do IBGE".

Mesoregions and microregions are the pre-2017 division. IBGE replaced them with **Regiões Geográficas
Intermediárias** and **Regiões Geográficas Imediatas**. Presenting mesoregions as the "official IBGE regions"
would be false for a public site.

## Audit of the source

- `scripts/build-geo.mts` reads `https://servicodados.ibge.gov.br/api/v1/localidades/municipios`.
- The same response already carries `regiao-imediata.regiao-intermediaria` for every municipality.
- Coverage in the Sul: 1191 of 1191 municipalities have an intermediate region (0 missing). 21 regions:
  PR 6, SC 7, RS 8.

## Decision

Migrate the public microcontext and the grouping to the **Região Geográfica Intermediária** (2017).

- Same endpoint, same script, deterministic per municipality: the IBGE name is stored as-is in
  `data/geo/municipios.json` (fourth column, for example `Chapecó`).
- Public label is built in `src/lib/geo/cities.ts`: `Região de Chapecó` (`City.area`, `City.areaSlug`).
- The state page caption reads "Divisão do IBGE (2017)". Nothing on the site says "mesorregião" or "regiões
  oficiais".
- Intermediate regions, not immediate ones: 21 groups in the Sul is browsable on a phone; the immediate
  division has 96, which would turn the state page back into a long list.
- No mesoregion data is kept in the repository.

## Consequences

- Names are now IBGE's own and are named after the main city (for example "Região de Santa Cruz do Sul -
  Lajeado"). They are less colloquial than "Oeste Catarinense" or "Serra Gaúcha". That is a deliberate trade for
  a claim that is true. Colloquial names, if wanted later, belong in an editorial layer clearly labelled as
  such, not in this field.
- Some places read as far from their region's city (Torres appears under "Região de Porto Alegre"). This is IBGE's
  classification, shown as a fact, not as a promise of proximity.
- Search microcontext, city subtitle, "Mais da Região de …", state groups and home state shortcuts all read
  `City.area`. The search index field `m` carries the same label.
- The regional plan for Norte and Centro-Oeste uses the same field with no code change: the script already
  keeps those states.
- Re-running `npm run geo:build` is the only step to refresh the data.
