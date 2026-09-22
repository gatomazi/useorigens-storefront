# 0004. Geographic navigation reverts to mesoregions, kept explicitly editorial

- Status: accepted
- Supersedes: the navigation/grouping decision in [0002](0002-ibge-2017-intermediate-regions.md) (its audit of the
  source and its "no mesoregion data is kept" consequence no longer hold)
- Related: [0002](0002-ibge-2017-intermediate-regions.md)

## Context

0002 moved the storefront's geographic navigation and microcontext from mesoregions to IBGE's current
**Região Geográfica Intermediária** (2017), on the grounds that presenting mesoregions as "the official IBGE
regions" would be false.

In practice the 2017 names read as bureaucratic and unfamiliar to someone from the region ("Região de Santa Cruz
do Sul - Lajeado" for Torres, filed under "Região de Porto Alegre" despite being on the coast). They are correct,
but they do not serve the storefront's actual job here: helping someone find their city and feel it is theirs.
Mesoregion names ("Vale do Itajaí", "Serra Gaúcha", "Metropolitana de Porto Alegre") are the colloquial,
recognizable grouping people already use.

0002's own worry — presenting a discontinued division as "the official IBGE regions" — is real, but it is a
copy problem, not a reason to drop mesoregions. The fix is to never make that specific claim, not to avoid the
data.

## Decision

Navigate and write copy by the **mesoregion**, explicitly as an editorial/navigation grouping — never labelled
as "the official IBGE division" or "IBGE (2017)".

- The public copy for this grouping is "Agrupamento regional usado para facilitar a navegação." when an
  explanation is shown at all; it is never called "Regiões oficiais do IBGE" or "Divisão do IBGE (2017)".
- Group captions always read "NOME DA MESORREGIÃO" + a correctly pluralized city count ("1 cidade" /
  "N cidades"), never a bare number.

### Keeping both facts, deliberately apart

The 2017 intermediate region is still a true, current administrative fact — 0002 was right about that. Rather
than delete it, `City` (`src/lib/geo/cities.ts`) carries both, each with its own doc comment and its own field
pair, so a future page that needs the current official division has it ready without re-deriving it and without
risk of the two being confused:

- `area` / `areaSlug` — the **current** fact (Região Geográfica Intermediária, 2017). Not used in navigation
  today. Untouched by this ADR; `areaGroupsOfState`/`citiesOfSameArea` still exist and are documented as
  currently unused.
- `meso` / `mesoSlug` — the **editorial** grouping (the discontinued mesoregion) that the storefront actually
  navigates and writes copy with today. `mesoGroupsOfState`/`citiesOfSameMeso` are the navigation entry points.

Both are read from the same IBGE municipalities endpoint in one pass (`scripts/build-geo.mts`), deterministic
per municipality, never guessed or inferred from proximity or from the other field.

### Source and coverage

`https://servicodados.ibge.gov.br/api/v1/localidades/municipios` already carries, per municipality,
`microrregiao.mesorregiao` (the mesoregion) alongside `regiao-imediata.regiao-intermediaria` (the 2017
region) — the same response 0002 already audited, one more field read from it.

Sul coverage: 1191 of 1191 municipalities have a mesoregion (100%; the one municipality nationally with no
mesoregion, in MT, is outside the Sul). 23 mesoregions in the Sul:

| UF | groups | cities |
|----|--------|--------|
| PR | 10     | 399    |
| SC | 6      | 295    |
| RS | 7      | 497    |

(Full per-mesoregion breakdown lives in `tests/unit/editorial.test.ts`, asserted against the live data rather
than hardcoded prose that could drift.)

## Consequences

- City subtitle, search microcontext, "Mais de …", state page groups and home state shortcuts all read
  `City.meso` again (`City.area` stays available but unread by any current view).
- The city-page heading uses the gender-neutral "Mais de {mesoregion}" (not "da"/"do"), since mesoregion names
  do not share a consistent grammatical gender ("Vale do Itajaí" vs. "Grande Florianópolis").
- Every place that shows a mesoregion **group's** city count uses `pluralCidades()` (`src/lib/format.ts`) so it
  never reads "1 cidades". State/region-level totals elsewhere are unaffected — that was never this ADR's scope.
- Tests: `tests/unit/editorial.test.ts` has a full-coverage test (every Sul municipality has a non-empty
  `meso`) and a count-consistency test (the sum of `mesoGroupsOfState` group sizes per state equals that
  state's total covered municipalities), plus the known per-state group counts above. `tests/e2e/sul.spec.ts`
  asserts the rendered mesoregion names/counts and that no "Região de …" text remains in the UI.
- Re-running `npm run geo:build` is still the only step to refresh either fact; nothing is hand-maintained.
