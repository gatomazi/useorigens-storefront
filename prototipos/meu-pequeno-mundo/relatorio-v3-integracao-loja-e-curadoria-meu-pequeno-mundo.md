# Meu Pequeno Mundo — v3: integração à loja e curadoria

Rodada de 14/10/2026, a partir de `comando-claude-v3-integracao-loja-e-curadoria-meu-pequeno-mundo.md`. Branch `feature/meu-pequeno-mundo-v3`.
Nada foi publicado nem mergeado. A produção não muda: a variável `MEU_PEQUENO_MUNDO` continua sem valor, então está desligada.

## O que mudou

- **Rota da loja `/meu-pequeno-mundo`.** É a mesma experiência da v2.1, com a tipografia e a marca da loja. A marca leva de volta à loja
  de chegada (`/sul`, `/norte` ou `/centro-oeste`). O layout é próprio e só carrega o GA4. O Three.js (npm, 0.186.1 fixo) carrega só
  nessa rota, em chunks próprios. O protótipo avulso passou a ser gerado dos mesmos módulos (`npm run mundo:prototipo`).
- **Três entradas discretas**, que só aparecem com `MEU_PEQUENO_MUNDO=on`:
  - na home, um bloco logo depois da escolha de estados, com imagem estática de 36 KB, "Os lugares que fazem parte de você" e
    "Montar meu mundo";
  - na página de cidade, um convite abaixo dos produtos ("Curitiba faz parte da sua história?");
  - no rodapé, o link "Meu Pequeno Mundo".

  São links `<a>` simples, sem prefetch: nada do mundo carrega nas páginas da loja.
- **Chegada pela cidade (`cidade=<id>`).** O mundo sugere a cidade e a pessoa escolhe o papel. Nada salvo é trocado sozinho, e um link
  completo de mundo prevalece sobre a sugestão.
- **Catálogo de uma fonte só.** `src/lib/mundo/catalogo.ts` alimenta `/api/mundo/*` e a exportação do protótipo. Os 2.144 lugares e
  as 16.842 camisetas reais mantêm IDs, aliases, URLs e as RAs do DF. O índice carrega uma vez e cada lugar sob demanda; falhas ficam
  isoladas. Perfis e sedes do IBGE estão em `data/mundo/`.
- **Seis perfis novos**: Curitiba, Porto Alegre, Goiânia, Campo Grande, Belém e Manaus. Cada um tem cenário próprio e marcos novos na
  maquete: estufa, usina com chaminé, mercado, torre do relógio, lago com mureta, lago com ilha, sobrado, mercado de ferro, teatro de
  frontão, teatro de cúpula e as duas águas lado a lado. Mais o ipê.
- **Curadoria fora dos dados gerados**: modelo (`data/mundo/modelo-perfil.json`), guia curto (`docs/mundo/curadoria.md`), validação
  (`npm run mundo:validar`, com aprovação estrutural separada da editorial) e a tabela de cobertura (`docs/mundo/cobertura-perfis.md`).
- **Analytics** com o GA4 que a loja já usa, em contrato fechado de 8 eventos (`docs/mundo/eventos.md`). A barra de endereço é limpa
  antes de qualquer script. O `page_view` leva só o caminho, e nenhuma lembrança, busca ou mundo completo é enviado.

## Como ver

```bash
# no repositório, com o catálogo local em data/generated
MEU_PEQUENO_MUNDO=on npm run dev
```

- Home com o bloco: http://localhost:3000/sul
- Página de cidade com o convite: http://localhost:3000/sul/pr/curitiba
- Mundo com as três regiões: http://localhost:3000/meu-pequeno-mundo?mundo=1&origem=4106902&presente=5208707&coracao=1302603
- Perfis novos: http://localhost:3000/meu-pequeno-mundo?mundo=1&origem=4314902&presente=5002704&coracao=1501402

Ativação e reversão em produção: `docs/mundo/ativacao.md`. O resumo é `pagina` para só a página, `on` para página e entradas e
"sem valor" para desligado. A rota e as APIs obedecem na hora. As páginas da loja seguem o ISR de 1 hora: num container novo, que é o
deploy de quando uma variável muda, elas já saem com o valor novo.

## Perfis: o que precisa de revisão editorial humana

Os nove perfis passam na validação estrutural. **Nenhum tem aprovação editorial.** Garopaba está em "revisão externa"; os outros
oito, em "curadoria inicial". Antes de ligar as entradas, rode `npm run mundo:validar -- --exigir-editorial`. Pontos a olhar:

| Perfil | O que revisar |
|---|---|
| Curitiba | Altitude atribuída ao Turismo (934 m; a página Dados Gerais diz 945 m). Hipótese do nome atribuída. Só um marco na maquete (a estufa), porque a forma da Ópera de Arame não foi confirmada. |
| Porto Alegre | O IBGE dá duas datas para "cidade" (1812 e 1822), e o texto não escolhe. A situação atual da Usina do Gasômetro, em obras e reabertura, não é afirmada. |
| Goiânia | Algumas páginas da Prefeitura (`/agora/`) respondem 404, mas mostram o texto. A revitalização do Lago das Rosas está em obras. As rosas da maquete vêm do plantio de 2023. |
| Campo Grande | A área do parque diverge (116 ha × 119 ha) e o texto usa 116 ha (Imasul, 2024). A data do registro do sobá diverge e o texto usa o ano. A figura na ilha é genérica. |
| Belém | Os sites da Prefeitura estavam fora do ar. O número de ilhas diverge, então o texto não dá o número. O número de torres e as cores do Mercado de Ferro são ilustrativos. Vale decidir se a inscrição dos Teatros da Amazônia na Unesco (27/07/2026) deve ser destacada. |
| Manaus | O tombamento do Encontro das Águas está judicializado, e o texto diz "aprovado pelo Conselho em 2010, levado à Justiça". O superlativo "único no planeta" ficou de fora. |
| Nova Trento, Tijucas, Garopaba | Sem mudança de texto nesta rodada. Garopaba mantém a clarificação da revisão de 14/10. |

Todas as fontes são primárias: IBGE, prefeituras, governos estaduais, Iphan e universidades. A data de consulta é 14/10/2026.
As formas da maquete são simplificações, e cada marco avisa o que é ilustrativo.

## Validação

| Verificação | Resultado |
|---|---|
| QA da integração (`scripts/qa/mini-mundo-v3.mjs`), 3 servidores de produção (on, pagina, off) | **77/77**, 0 erro de console. 2 checagens puladas: o bloco nas homes do Norte e do Centro-Oeste, porque a configuração local delas não tem a seção de estados. Com uma cópia temporária da configuração que tem a seção, o bloco apareceu com `loja=norte` e `loja=centro-oeste`. Em produção, as três homes têm a seção, seguida do pódio. |
| Suíte da v2.1 na página da loja | **60/60**, 0 erro de console. A suíte passou a aceitar os links do próprio ambiente e a olhar só a experiência, sem o banner de cookies da loja. Uma checagem de toque em marco falhou 2 vezes por tempo: o toque saía logo depois de a ficha voltar ao topo. Isolado, o toque funciona. A checagem ganhou uma espera de 400 ms. |
| Suíte da v2.1 no protótipo regenerado | **60/60**, 0 erro de console |
| `npm run mundo:validar` | 9 perfis, 72 fontes, nenhuma falha. Um arquivo quebrado de propósito gerou as 8 falhas esperadas: chave repetida, ID inexistente, módulo desconhecido, fonte sem cadastro, marco sem texto, mais de 2 marcos e campo vazio. |
| Testes unitários (`vitest`) | 1.381/1.381 |
| `tsc --noEmit` e `eslint` nos arquivos tocados | sem erros |
| Suítes e2e da vitrine (Playwright, 7 specs, flag ligada) | 127/142. As **mesmas 15 falhas** acontecem na base `ca60a38`, sem a integração: menu do celular, cor do topo, 404, página de estado curta, ordem das seções da home e o dropdown de região. São falhas anteriores, ligadas ao menu e à home novos do PR #69. **Nenhuma regressão.** |

A integração cobre:

- **Flag nos três modos:** 404, noindex, as entradas e o canonical sem parâmetros.
- **Entradas:** as três, por clique e por teclado (foco visível, alvos de 44 px ou mais), com registro da entrada correta
  (`home`, `cidade`, `rodape`).
- **Chegada pela cidade:** sem progresso, com progresso v2, com progresso no formato da v1, com "Agora não" e com link completo.
- **Mundo por link:** barra limpa, nada gravado por cima do mundo salvo e recarga que mantém o mundo.
- **Links e arquivos:** links do próprio ambiente, link antigo do protótipo redirecionado com os parâmetros e PNG 1080 × 1350 com e
  sem lembranças (com emoji e acentos).
- **Compartilhamento:** link copiado e cancelamento nativo, que não aparece como erro nem como sucesso.
- **Analytics:** as coletas não levam lembrança, busca nem mundo, e o consentimento segue a mesma regra da loja.
- **Falhas isoladas:** Three.js sem carregar, código da experiência sem carregar (aviso com "Tentar de novo"), índice e perfis
  indisponíveis e navegador sem WebGL.

## Desempenho nas páginas afetadas da loja

Builds de produção com o mesmo `.env`: a base é `ca60a38`, antes da integração. CDP, sem cache.

| Página | Tela | JS (KB) base → desligado → ligado | Total (KB) | Requisições | Scripts 3D |
|---|---|---|---|---|---|
| home Sul | desktop | 651 → 651 → 652 | 1873 → 1873 → 1855 | 65 → 65 → 63 | 0 / 0 / 0 |
| cidade (Florianópolis) | desktop | 644 → 644 → 644 | 1141 → 1141 → 1142 | 39 → 39 → 39 | 0 / 0 / 0 |
| produto (Ponto de Origem) | desktop | 644 → 644 → 644 | 858 → 858 → 858 | 36 → 36 → 36 | 0 / 0 / 0 |
| cidade (Tijucas) | desktop | 644 → 644 → 644 | 1129 → 1129 → 1130 | 37 → 37 → 37 | 0 / 0 / 0 |
| home Sul | celular | 651 → 651 → 651 | 1033 → 1033 → 1023 | 58 → 58 → 56 | 0 / 0 / 0 |
| cidade (Florianópolis) | celular | 644 → 644 → 644 | 921 → 922 → 922 | 39 → 39 → 39 | 0 / 0 / 0 |
| produto (Ponto de Origem) | celular | 648 → 644 → 644 | 831 → 827 → 827 | 36 → 36 → 36 | 0 / 0 / 0 |
| cidade (Tijucas) | celular | 644 → 644 → 644 | 914 → 914 → 915 | 37 → 38 → 37 | 0 / 0 / 0 |

Desligado, nada muda. Ligado, só entram o HTML das entradas e a imagem do bloco, que carrega sob demanda quando a pessoa rola até ela.
Com o bloco empurrando conteúdo para baixo, a home ligada até faz menos requisições na primeira tela.

A própria página `/meu-pequeno-mundo`, com um mundo de três lugares e transferência comprimida, soma 1.743 KB:

- JS: 622 KB, dos quais 186 KB são do Three.js;
- dados (`/api/mundo`, índice, 3 lugares e perfis): 281 KB;
- maquete pronta em 1,6 s no celular emulado (SwiftShader, sem GPU, servidor local).

## Pendências

- **Dispositivos reais:** não testei em iPhone nem em Android físicos. A validação foi em Chromium (SwiftShader), com emulação de
  375 × 812 e em 1440 × 900. Ficam pendentes:
  - folha de compartilhamento nativa;
  - download do PNG no iOS;
  - desempenho do 3D em aparelho intermediário;
  - teclado virtual sobre a busca;
  - gestos na maquete.
- **Revisão editorial** dos 9 perfis (tabela acima).
- **GA4 real:** os eventos foram conferidos com as coletas interceptadas, não no DebugView da propriedade. Conferir lá depois de ligar
  em `pagina`.
- **Banner de cookies da loja:** o link "Política de Privacidade" tem 33 px de altura na loja inteira e também aparece sobre o mundo
  até a escolha. É um problema anterior, fora do mundo, e não foi alterado.
- Arapoanga e Água Quente (DF) continuam sem ponto oficial, sem distância e sem coordenada estimada.

## Pacote

`npm run mundo:dados && npm run mundo:prototipo && npm run mundo:pacote` gera `prototipos/meu-pequeno-mundo/pacote/meu-pequeno-mundo-v3.zip`.
O pacote traz HTML, `contexto/`, `dados/`, relatórios, documentação e evidências, e foi testado descompactado. Ele precisa de internet
para o Three.js (jsDelivr), as fontes, as fotos das camisetas e os links. Evidências desta rodada: `evidencias-v3/`.

### Evidências (`evidencias-v3/`)

| Pasta | O que tem |
|---|---|
| `integracao/` | Bloco da home (01, e 02 com foco do teclado), convite da cidade (03), sugestão sem e com progresso (04, 05), mundo com as três regiões (06, 10), perfis novos (10), falhas isoladas (07–09) e PNGs exportados com e sem lembranças; `resultado-v3.json` |
| `perfis-novos/` | As seis ilhas novas em close (a ficha aberta) e os dois mundos com elas |
| `v21-na-loja/`, `v21-no-prototipo/` | Suíte da v2.1 na página da loja (capturas e resultado) e no protótipo (resultado) |
| `desempenho/` | Medições da base, da v3 desligada e da v3 ligada (JSON) |
| `e2e-vitrine-*.log` | Suítes e2e da vitrine na v3 e na base, com as mesmas 15 falhas |

