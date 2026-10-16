# Curadoria de cidades do Meu Pequeno Mundo — guia de pesquisa

Para quem pesquisa e escreve **perfis curados** de cidades (pessoa ou agente). Complementa `docs/mundo/curadoria.md` (as regras) com o
método que produziu os perfis de outubro de 2026: base do IBGE por script, um rascunho por cidade e **todo fato conferido pelo trecho
literal da fonte** antes de entrar.

Pasta de trabalho: `.mundo-curadoria/` na raiz do repositório (fora do git). Ferramentas: `scripts/mundo-curadoria/`.

```
npm run mundo:dados                                  # índice do catálogo (uma vez)
python3 -m venv .mundo-curadoria/venv && .mundo-curadoria/venv/bin/pip install pypdf   # leitura de PDF (uma vez)
python3 scripts/mundo-curadoria/base.py 60           # fila das próximas 60 cidades + base do IBGE de cada uma
```

## 1. O que ler primeiro

- `.mundo-curadoria/base/<id>.json`: dados do IBGE já prontos (nome, UF, loja, sede, população, área, regiões, gentílico e a fonte da
  Biblioteca do IBGE com chave pronta). **Não pesquise nem reescreva esses números**; o montador os injeta.
- `.mundo-curadoria/base/<id>-ibge.txt`: histórico, formação administrativa e gentílico da Biblioteca do IBGE (texto literal da API).
- `docs/mundo/curadoria.md`: regras de texto e de cenário (obrigatório).
- `data/mundo/perfis-cidades.json`: os perfis prontos. Leia ao menos Campo Grande (`5002704`), Belém (`1501402`) e Florianópolis
  (`4205407`) como exemplo de tom, tamanho, referências, notas e bloco `visual`.

## 2. Como pesquisar

1. Use a busca na web para achar fontes primárias: prefeitura e câmara municipal, governo do estado (turismo, cultura, meio ambiente),
   Iphan e institutos estaduais de patrimônio, IBGE, ICMBio, universidades públicas, museus e sites oficiais do bem. Agregadores,
   blogs, Wikipédia, TripAdvisor e resumos de busca **não servem como fonte** (podem servir só para descobrir o que procurar).
2. Para todo fato que for entrar no texto, pegue o **trecho literal** com a ferramenta local (não cite o resumo de uma ferramenta de leitura
   da web: ele parafraseia):
   ```
   python3 scripts/mundo-curadoria/trecho.py "<url>" "termo" ["outro termo" ...]   # ocorrências com o texto em volta
   python3 scripts/mundo-curadoria/trecho.py "<url>" --tudo [inicio] [fim]          # o texto da página (HTML ou PDF)
   python3 scripts/mundo-curadoria/trecho.py --conferir "<url>" "<trecho exato>"    # OK se o trecho está na página
   ```
   Se uma página oficial recusar o acesso pela ferramenta (403, só JavaScript), procure outra página oficial com o mesmo fato.
   Só em último caso leia de outro jeito e marque a evidência com `"verificacao": "manual"` (vai para conferência humana).
   **No máximo 3 evidências manuais por cidade**; acima disso a cidade fica `parcial` e não entra (foi o caso de Penha e Cachoeirinha).
   Desconfie de página oficial que copia a Wikipédia sem dizer: não use como fonte (aconteceu em Urubici).
3. **Sem busca na web (ou quando ela acabar)**, ache as fontes navegando direto: site da prefeitura (em geral
   `https://www.<cidade>.<uf>.gov.br`, com busca interna e menus "A cidade", "História", "Turismo"), câmara municipal, portal
   de turismo do estado, Iphan (`https://www.gov.br/iphan/pt-br`), institutos estaduais de patrimônio, ICMBio e a
   Enciclopédia dos Municípios Brasileiros do IBGE (biblioteca.ibge.gov.br), que já serviu bem para relevo e paisagem.
   Use `trecho.py --tudo` para ler páginas e achar links. Se não achar fonte para 3 referências, 2 bastam.
4. Para a Biblioteca do IBGE, os trechos saem do `<id>-ibge.txt` (a URL da fonte é a da API, que a ferramenta também lê).

## 3. O que escrever (regras de `curadoria.md`, resumidas)

- **Só fato com fonte primária.** Cada frase do resumo, cada referência e cada curiosidade apontam para fontes declaradas.
- **Texto próprio.** Escreva com suas palavras; não copie frases das fontes (o trecho literal vai só nas `evidencias`, que não são
  publicadas).
- **Datas administrativas separadas** (freguesia, distrito, vila, município, cidade, instalação, capital) como o IBGE separa. Não
  chame data administrativa de fundação. **Hipóteses de nome sempre atribuídas** ("Segundo o histórico do IBGE, o nome viria de…").
- **Sem promessa** (avistamento, festa, horário, obra concluída), **sem superlativo** ("o maior", "único", "mais bonito"),
  **sem política atual** (nomes de governantes atuais, disputas). Divergência entre fontes: use o que é comum ou deixe de fora, e
  registre em `observacao`.
- Povos indígenas, quilombolas e imigrantes: cite com respeito e só o que a fonte diz.
- **Tamanhos (o validador recusa acima disso):** `frase` ≤ 160 caracteres; `resumo` 3 a 5 frases e ≤ 600; `referencias[].titulo`
  ≤ 80, `texto` ≤ 420, `curto` ≤ 200; `curiosidades[].texto` ≤ 400 (no máximo 2); `descoberta.nota` ≤ 140; `visual.rotulo` ≤ 90.
- **3 referências** por cidade (mínimo 2), `tipo` entre `natureza`, `cultura`, `patrimonio`, `tradicao`, `paisagem`. Prefira
  lugares e tradições que um morador reconheceria. Até 2 delas viram marco na maquete (com `descoberta` e `curto`).
- O `resumo` fala da paisagem (relevo, água, vegetação), da formação histórica e de algo da identidade da cidade. Não repita
  população nem área (já aparecem na ficha).
- `gentilico`: pode omitir (o montador usa o do IBGE). Se incluir variantes, elas precisam de fonte.

## 4. O cenário (`visual`)

O cenário é **ilustrativo**, mas vem das fontes: uma cidade de serra não vira praia; uma capital do Norte não vira floresta
fechada só por estar no Norte; uma capital do Centro-Oeste não vira fazenda. Explique em `ambiente` de onde vieram as escolhas.

| Campo | Valores |
|---|---|
| `base` (paleta e relevo de partida) | `litoral`, `serra`, `campos`, `vale`, `interior`, `amazonia`, `cerrado`, `alagado` |
| `ambientes` (1 a 3, aparecem no resumo do mundo) | `vale`, `litoral`, `rio`, `campo`, `serra`, `urbano`, `floresta`, `cerrado` |
| `relevo.modulo` | `vale-montes` (com `altura` 0,3–1,6), `planicie`, `costa-dunas` |
| `agua.modulo` (`largura` 0,1–0,6 e `direcao` −3,2–3,2 opcionais) | `rio`, `rio-largo`, `vereda`, `mar`, `costa`, `lagoas`, `lagoas-muitas`, `lago`, ou omita o campo |
| `vegetacao` (pares `[tipo, quantidade 0–40]`) | `redonda`, `araucaria`, `palmeira`, `buriti`, `mata`, `cerrado`, `arbusto`, `capim`, `junco`, `restinga`, `ipe` |
| `construcoes` | `{ "estilo": "colonial" \| "urbano" \| "acoriano", "casas": 0–14, "predios": 0–6 }` (prédios só em `urbano`) |
| `extras` | `pier`, `barco`, `cerca`, `silo`, `lavoura` |
| `cores` (opcional; omita para usar a paleta da base) | `grama: ["#rrggbb", "#rrggbb"]`, `areia`, `fundo`, `caminho`, `terra` |
| `rotulo` | Como a ilha aparece, em poucas palavras (≤ 90) |
| `marcos` | até 2: `{ "modulo": "<marco>", "referencia": "<id da referência>" }` |

**Marcos disponíveis.** A forma é sempre genérica e simplificada; escolha a que corresponde ao tipo do lugar e diga na `nota` o que
é ilustrativo. Nunca tente reproduzir obra autoral (Niemeyer, esculturas, monumentos assinados): ou use uma forma genérica que não
imite a obra e diga isso na nota, ou deixe a referência só com texto (sem `descoberta`).

| Marco | Forma na maquete | Exige |
|---|---|---|
| `igreja` | igreja ou matriz com uma torre sineira central, frontão e paredes claras | — |
| `catedral` | fachada com duas torres simétricas e nave longa | — |
| `ruinas` | ruínas de igreja de pedra avermelhada, sem telhado, com torre parcial | — |
| `palacio` | prédio público clássico de dois pavimentos com colunata, escadaria e mastro | — |
| `teatro-frontao` | teatro neoclássico com frontão triangular e colunas | — |
| `casarao` | casarão colonial de beiral, paredes claras e janelas em série | — |
| `sobrado` | sobrado eclético de dois pavimentos | — |
| `mercado` | mercado público de dois pavimentos com pátio e torres nos cantos | — |
| `mercado-ferro` | galpão de estrutura de ferro com torres de canto, junto à água | água |
| `usina` | galpão com chaminé alta de tijolo, junto à água | — |
| `estacao` | estação ferroviária com plataforma coberta, trilho e locomotiva pequena | — |
| `torre-relogio` | torre fina com relógio nas quatro faces | — |
| `coreto` | coreto octogonal numa praça arborizada | — |
| `monumento` | obelisco sobre pedestal numa praça (genérico; não reproduz estátua) | — |
| `mirante` | torre de observação com plataforma no alto | — |
| `forte` | fortaleza baixa de pedra com muralhas em ângulo, guaritas e mastro | — |
| `farol` | farol listrado sobre um rochedo | `agua` = `mar` ou `costa` |
| `trapiche` | píer de madeira que avança sobre a água, com quiosque na ponta | `agua` = `mar`, `costa`, `rio`, `rio-largo`, `lago`, `lagoas` ou `lagoas-muitas` |
| `ponte-urbana` | ponte baixa de concreto sobre o rio | `agua` = `rio`, `rio-largo` ou `vereda` |
| `ponte-pensil` | ponte pênsil com duas torres e cabos | `agua` = `rio`, `rio-largo`, `mar` ou `costa` |
| `cachoeira` | paredão de pedra com queda d'água e poço | — |
| `vinhedo` | fileiras de parreiras numa encosta, com uma casa de pedra | — |
| `lago-mureta` | lago urbano com mureta e trampolim | — |
| `lago-ilha` | lago com ilha, deck e árvores | — |
| `estufa` | estufa de ferro e vidro | — |
| `pico-cruz` | morro com cruz no topo | `relevo` = `vale-montes` |
| `dunas` | campo de dunas | `relevo` = `costa-dunas` |
| `baleia` | baleia no mar | `agua` = `mar` |

Evite `santuario`, `teatro-cupula` e `encontro-aguas`: são formas específicas de Nova Trento e Manaus.

Cada marco aponta para uma referência cuja `descoberta.modulo` é o mesmo módulo, e essa referência tem `curto` (vai no balão).

## 5. Formato de `.mundo-curadoria/lote/<id>.json`

```json
{
  "id": "4205407",
  "status": "pronto",
  "fontes": {
    "ibge-biblioteca-florianopolis-sc": { "...": "copie de base/<id>.json → fonteBiblioteca (pode ajustar o publicador)" },
    "florianopolis-iphan-fortaleza-anhatomirim": {
      "titulo": "Título como aparece na página",
      "publicador": "Órgão ou instituição responsável",
      "url": "https://…",
      "referencia": "Notícia de 12/03/2024 | Página institucional (sem data) | Documento de 2019",
      "consultadoEm": "AAAA-MM-DD"
    }
  },
  "conteudo": {
    "frase": "…",
    "resumo": "…",
    "fontesResumo": ["…"],
    "referencias": [
      { "id": "slug-da-referencia", "tipo": "patrimonio", "titulo": "…", "texto": "…", "fontes": ["…"],
        "descoberta": { "modulo": "forte", "nota": "Na maquete, uma fortaleza simplificada; muralhas e cores são ilustrativas." },
        "curto": "…" },
      { "id": "…", "tipo": "natureza", "titulo": "…", "texto": "…", "fontes": ["…"] }
    ],
    "curiosidades": [{ "texto": "…", "fontes": ["…"] }]
  },
  "visual": { "ambientes": ["…"], "rotulo": "…", "base": "…", "relevo": { "modulo": "…" }, "agua": { "modulo": "…" },
              "vegetacao": [["…", 8]], "construcoes": { "estilo": "…", "casas": 8, "predios": 3 }, "extras": [],
              "marcos": [{ "modulo": "forte", "referencia": "slug-da-referencia" }] },
  "observacao": "Divergências entre fontes, o que o texto evitou afirmar, fontes fora do ar.",
  "ambiente": "De onde veio o cenário, citando as chaves das fontes (ex.: relevo e rio citados em florianopolis-…).",
  "evidencias": [
    { "onde": "resumo, frase 1", "fonte": "chave-da-fonte", "trecho": "trecho literal copiado da página, 20 a 250 caracteres" }
  ]
}
```

- **Chaves de fonte**: minúsculas com hífen, começando pelo `slug` da cidade (está em `base/<id>.json`). Uma fonte por página.
  `consultadoEm` = a data de hoje (AAAA-MM-DD). URL sempre `https://`.
- **Evidências**: pelo menos uma por fato publicado (cada frase do resumo, cada referência, cada curiosidade, e o que sustenta o
  cenário). O trecho é cópia exata de um pedaço contínuo da página (sem reticências, sem cortes no meio, sem correções).
- `status`: `"pronto"` quando tudo passou; `"parcial"` se faltou fonte para algo importante (explique em `observacao`).

## 6. Conferência antes de terminar (obrigatória)

```
python3 scripts/mundo-curadoria/montar.py --checar <id>
```
Ele monta o perfil com a base do IBGE, roda o validador do repositório e confere cada evidência na fonte. Corrija até aparecer
`VALIDADOR: OK` e todas as evidências `OK` (ou `MANUAL`, quando justificado). Uma evidência que não aparece na fonte indica fato sem
sustentação: troque o trecho pelo literal certo ou tire o fato do texto.

## 7. Juntar e registrar

Quando o `--checar` passar e o status for `pronto`:

```
python3 scripts/mundo-curadoria/juntar.py      # junta todo rascunho pronto e aprovado no --checar ao perfis-cidades.json
npm run mundo:validar && npm run mundo:cobertura
```

Registre em `revisao.observacao` (o campo `observacao` do rascunho) o que a revisão humana precisa olhar: divergências entre fontes, o
que ficou de fora e por quê, fontes fracas ou antigas, marcos cuja forma não bate com o real.
