# Meu Pequeno Mundo — protótipo

Maquete 3D (Three.js) em que a pessoa monta um pequeno mundo com até três lugares — origem, presente e lugar do coração — e chega às
camisetas reais de cada cidade. Na v2, cada cidade com perfil ganha cenário próprio, marcos que contam uma história curta, uma ficha
com fontes e uma lembrança pessoal opcional. Protótipo isolado: não altera o storefront.

- `meu-pequeno-mundo-use-origens.html` — o protótipo inteiro (HTML, CSS e JS num arquivo; Three.js 0.186.1 por CDN com versão fixa).
- `contexto/perfis-cidades.json` — **perfis curados** (piloto: Nova Trento, Tijucas e Garopaba): texto, referências, números do IBGE,
  perfil visual e proveniência de cada fato. Versionado no git; editar um texto ou perfil não mexe no código da cena.
- `contexto/sedes-municipais-ibge-2022.json` — ponto da sede municipal (e das Regiões Administrativas do DF) e divisão regional de
  2017 de todas as cidades dos estados da loja, extraídos do IBGE (Localidades 2022) por `scripts/mini-world-sedes.mts`.
- `relatorio-meu-pequeno-mundo-use-origens.md` — v1: implementação, dados, validação, avaliação e próximos passos.
- `relatorio-v2-contexto-cidades-meu-pequeno-mundo.md` — v2: perfis, fontes, cobertura real, validação e limitações.
- `evidencias/` (v1) e `evidencias-v2/` — capturas reais (Chromium, 1440×900 e 375×812) e PNGs exportados pela própria página.
- `dados/` — **gerado, fora do git**: índice das cidades e um arquivo por cidade (camisetas, ponto do IBGE, regiões), exportados do catálogo local.

## Rodar

```bash
npm run mundo:dados                      # lê data/generated (catalog:sync) + contexto/sedes… e escreve prototipos/meu-pequeno-mundo/dados/
cd prototipos/meu-pequeno-mundo && python3 -m http.server 4321 --bind 127.0.0.1
# abrir http://127.0.0.1:4321/meu-pequeno-mundo-use-origens.html
# o mundo do piloto direto: …/meu-pequeno-mundo-use-origens.html?mundo=1&origem=4211504&presente=4218004&coracao=4205704
```

Aberto direto do disco (`file://`), o navegador não deixa ler `dados/` nem `contexto/`: o protótipo entra em **demonstração** (6 cidades
de exemplo, sem camisetas nem perfis, "Catálogo ainda não conectado") e o link do mundo fica desabilitado; o resto funciona.

## Atualizar os dados de contexto

```bash
# sedes municipais e regiões (só quando o IBGE publicar outra base de localidades)
node --import tsx scripts/mini-world-sedes.mts <Localidades_Municipios_kml.zip>
# depois, sempre que mudar o catálogo ou as sedes
npm run mundo:dados
```

Para acrescentar uma cidade com perfil, copie um bloco de `cidades` em `contexto/perfis-cidades.json` com o mesmo formato: o ID é o do
catálogo (código IBGE do município), cada referência, curiosidade e número precisa apontar para uma chave de `fontes`, e o perfil
visual só aceita os módulos listados em `MODULOS` (seção 2 do HTML). O que não tiver fonte não aparece na ficha.

## QA

```bash
node scripts/qa/mini-mundo.mjs <pasta-de-saida> [url-da-previa]          # fluxos da v1 (critérios de aceite)
node scripts/qa/mini-mundo-v2.mjs <pasta-de-saida> [url-da-previa]       # v2: perfis, fichas, descobertas, lembranças, compatibilidade
node scripts/qa/mini-mundo-cliques.mjs <pasta-de-saida> [url-da-previa]  # mapa de cliques para o UX (capturas numeradas)
```

Com o servidor acima no ar. Cada roteiro salva capturas, PNGs exportados e um resumo em JSON.
