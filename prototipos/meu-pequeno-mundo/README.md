# Meu Pequeno Mundo — protótipo

Maquete 3D (Three.js) em que a pessoa monta um pequeno mundo com até três lugares — origem, presente e lugar do coração — e chega às
camisetas reais de cada cidade. Na v2, cada cidade com perfil ganha cenário próprio, marcos que contam uma história curta, uma ficha
com fontes e uma lembrança pessoal opcional.

**Na v3 a experiência entrou na loja**, em `/meu-pequeno-mundo`, atrás da variável `MEU_PEQUENO_MUNDO` (desligada por padrão; ver
`docs/mundo/ativacao.md`). O código vive em `src/components/mundo/` e este HTML avulso passou a ser **gerado** dos mesmos módulos
(`npm run mundo:prototipo`). Não edite o HTML à mão.

- `meu-pequeno-mundo-use-origens.html` — o protótipo inteiro, gerado (HTML, CSS e JS num arquivo; Three.js 0.186.1 por CDN com versão fixa).
- `contexto/perfis-cidades.json` — **cópia gerada** de `data/mundo/perfis-cidades.json` (fora do git). Os perfis curados agora ficam em
  `data/mundo/` e servem a loja e o protótipo: 9 cidades (Nova Trento, Tijucas, Garopaba, Curitiba, Porto Alegre, Goiânia, Campo Grande,
  Belém e Manaus). Guia em `docs/mundo/curadoria.md`; validação com `npm run mundo:validar`.
- `data/mundo/sedes-municipais-ibge-2022.json` — ponto da sede municipal (e das Regiões Administrativas do DF) e divisão regional de
  2017 de todas as cidades dos estados da loja, extraídos do IBGE (Localidades 2022) por `scripts/mini-world-sedes.mts`.
- `relatorio-meu-pequeno-mundo-use-origens.md` — v1: implementação, dados, validação, avaliação e próximos passos.
- `relatorio-v2-contexto-cidades-meu-pequeno-mundo.md` — v2: perfis, fontes, cobertura real, validação e limitações.
- `relatorio-v21-acabamento-ux-meu-pequeno-mundo.md` — v2.1: acabamento de UX (resultado compacto, ficha em camadas, descobertas).
- `relatorio-v3-integracao-loja-e-curadoria-meu-pequeno-mundo.md` — v3: integração à loja, entradas, seis perfis novos e curadoria.
- `evidencias/` (v1), `evidencias-v2/`, `evidencias-v21/` e `evidencias-v3/` — capturas reais (Chromium, 1440×900 e 375×812), PNGs
  exportados pela própria página e medições.
- `dados/` — **gerado, fora do git**: índice das cidades e um arquivo por cidade (camisetas, ponto do IBGE, regiões), exportados do catálogo local.

## Rodar

```bash
npm run mundo:dados                      # lê data/generated (catalog:sync) e data/mundo/; escreve dados/ e contexto/ deste protótipo
npm run mundo:prototipo                  # gera o HTML avulso a partir de src/components/mundo/
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

Para acrescentar uma cidade com perfil, siga `docs/mundo/curadoria.md`: copie o modelo `data/mundo/modelo-perfil.json` para
`data/mundo/perfis-cidades.json`, preencha com fonte por fato e rode `npm run mundo:validar`.

## QA

```bash
node scripts/qa/mini-mundo.mjs <pasta-de-saida> [url-da-previa]          # fluxos da v1 (critérios de aceite)
node scripts/qa/mini-mundo-v2.mjs <pasta-de-saida> [url-da-previa]       # v2: perfis, fichas, descobertas, lembranças, compatibilidade
node scripts/qa/mini-mundo-v21.mjs <pasta-de-saida> [url-da-previa]      # v2.1: resultado compacto, ficha em camadas, toque no vazio, troca
node scripts/qa/mini-mundo-cliques.mjs <pasta-de-saida> [url-da-previa]  # mapa de cliques para o UX (capturas numeradas)
# v3, contra builds de produção (next start) com MEU_PEQUENO_MUNDO=on / pagina / off:
node scripts/qa/mini-mundo-v3.mjs <pasta> --on http://localhost:3300 --pagina http://localhost:3301 --off http://localhost:3302
node scripts/qa/mini-mundo-v21.mjs <pasta> http://localhost:3300/meu-pequeno-mundo   # a suíte da v2.1 na página da loja
node scripts/qa/mini-mundo-impacto.mjs <saida.json> http://localhost:3300 <rótulo>   # peso das páginas da loja (base × alterada)
```

Com o servidor acima no ar. Cada roteiro salva capturas, PNGs exportados e um resumo em JSON.

## Pacote para avaliar fora do repositório

```bash
npm run mundo:pacote   # → prototipos/meu-pequeno-mundo/pacote/meu-pequeno-mundo-v3.zip (fora do git)
```

O ZIP traz HTML, `contexto/`, `dados/`, relatórios e evidências com os caminhos relativos, além de um `LEIA-ME.md`. Roda com qualquer servidor estático.
