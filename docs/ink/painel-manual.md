# Mudanças manuais no painel da INK

Guia para qualquer mudança que precisa ser feita **pela tela do painel da INK** (`reserva.ink/user/dashboard/...`), à mão ou automatizada
com o Claude in Chrome. Escrito em 07/11/2026, depois da troca de tags de cidade em ~19,2 mil camisetas para o Order Bump (§4).

## 1. Quando o painel é o único caminho

- **Edição e criação de produtos pela API estão desativadas pela INK** desde, pelo menos, 06/11/2026. Qualquer `PATCH`/`POST` em
  `/v1/stores/products` responde `403` com *"A criação e a edição de produtos pela API estão temporariamente desativadas"*. Não é falta de
  escopo do token: o mesmo 403 sai com um token de escrita válido. O MCP mostra isso como `MISSING_SCOPE`, porque
  `src/lib/mcp/ink-live.ts` mapeia todo 403 para esse código.
- **Leitura pela API continua funcionando** (`GET /v1/stores/products`, `/v1/stores/collections`, pedidos). Use-a para montar a lista do
  que mudar e para **conferir** depois. O painel escreve, a API confere.
- **Pelo MCP (preview + confirmação do dono) continuam funcionando:** visibilidade de categorias, itens de pedido e trocas.
- **O "Guru" da INK** (assistente do painel) não edita produtos.
- **Só pela tela**, por enquanto:
  - tags, nome, descrição, preço e etiqueta de produto;
  - imagem de vitrine;
  - configuração do Order Bump;
  - renomear categorias.

## 2. Regras para automatizar o painel (Claude in Chrome)

1. **Ver o fluxo uma vez com o dono antes de automatizar.** Ele faz na tela, a gente lê o formulário, os campos e as requisições
   (`read_network_requests`). A automação repete exatamente o que a tela envia, nunca um endpoint adivinhado.
2. **Piloto com um grupo pequeno.** Rodar, conferir pela API que só o campo pedido mudou, e só então montar a fila.
3. **Aba dedicada, com o título "NÃO MEXER — …".**
   - O executor vive na página: navegar, recarregar ou fechar a aba mata a fila. Já aconteceu em 06/11, quando a aba foi usada para
     abrir os templates de WhatsApp.
   - Abra a aba você mesmo (`tabs_create_mcp`) e avise o dono para usar outra.
   - Fechar outras abas tira a aba do grupo do Claude, mas ela continua rodando. Acompanhe pela API (`progresso`).
4. **Uma fila por vez.** A seleção da edição em massa fica no servidor, na sessão: duas filas, ou alguém editando em massa à mão em paralelo,
   misturam os grupos.
5. **A fila para no primeiro erro.** Nada de "pular e seguir". Cada grupo é conferido antes de salvar (§3).
6. **Saída do `javascript_tool` sem dados de sessão.**
   - Nunca imprima cookie, `csrf-token` ou URL com query string: a ferramenta bloqueia a resposta, e é dado sensível.
   - Devolva só nomes, contagens e caminhos sem query.
7. **Fila grande não vai colada no prompt.** Crie um `<input type=file>` na página (o executor tem `campoArquivo()`) e envie o JSON com
   `file_upload`. 450 KB entram em um segundo.
8. **Rodar em segundo plano dentro da página e acompanhar.**
   - Um laço `async` longo dentro do `javascript_tool` estoura o tempo da ferramenta (45 s).
   - O executor dispara o laço e devolve na hora. Consulte `estado()` de vez em quando, ou siga pela API.
9. **`alert` e `confirm` do painel travam a aba.** Intercepte-os (veja `scripts/painel-mockups/executor.js`) ou evite os botões que os abrem.
10. **No fim:** confira tudo pela API, feche a aba e registre o que foi feito.

## 3. Edição em massa (Produtos → selecionar → "Modificar em massa")

**Na tela:**
1. Em *Produtos*, marque os produtos.
2. No rodapé, clique em **Modificar em massa**. A tela `/user/dashboard/products_v2/mass_edit` lista os selecionados e o formulário.
3. Preencha e clique em **Salvar**. A mudança é aplicada na hora.

Campos do formulário (`/user/dashboard/products_v2/mass_edit/bulk_update`, `_method=put`):

| Campo na tela | Nome no formulário | Observação |
|---|---|---|
| Nome | `product[name]` | vazio = não muda |
| Tags | `product[tags]` (hidden, separado por vírgula) + `product[tags_mode]` = `replace` \| `append` | o campo visível (*"Use vírgula para separar as tags."*) só preenche o hidden |
| Descrição | `product[description]` + `product[enable_description]` | |
| Preço | `product[price]` | |
| Etiqueta da promoção | `product[promotion_label]` + `product[enable_promotion_label]` | |
| Etiqueta (selo) | `product[label_container_attributes][…]` | |

Fatos medidos em 06/11/2026:

- **Campo vazio não mexe no produto.** Com só as tags preenchidas, nome, preço, preço promocional, descrição, status e visibilidade ficaram
  iguais em 19.253 produtos (conferido por releitura completa).
- **`POST …/mass_edit/select_products` com `{product_ids: [...]}` SUBSTITUI a seleção inteira**, não soma. Não precisa desmarcar antes.
- **Desmarcar um a um é lento.** `DELETE …/select_products/<id>` leva ~2 s cada, em série no servidor. Evite.
- **Tela de seleção:** a `GET /mass_edit?per_page=50` lista os selecionados como formulários `…/select_products/<id>`. A trava do
  executor usa essa lista. Grupos de **até 50 produtos**.
- **Tipos de peça diferentes no mesmo grupo dão erro na tela**, segundo o dono. Agrupe por tipo (Camiseta = tipo 1).
- **Salvar com sucesso responde redirect** para `/user/dashboard/products_v2`.
- **Ritmo:** ~2 s por grupo com o executor. Foram 2.144 grupos em ~75 min.

**Ferramentas:**

| Peça | O que faz |
|---|---|
| `scripts/painel-edicao-em-massa/executor.js` | Injetado na aba do painel. Para cada grupo `{key, ids, campos}`: seleciona → confere que a seleção do painel é exatamente aquele conjunto → envia o formulário do próprio painel com só os `campos` trocados → exige o redirect. Só aceita `product[tags]`/`product[tags_mode]`. Nome, descrição, preço e etiqueta só com `iniciar({ permitir: [...] })`. Progresso em `localStorage['__massa']`. |
| `npm run painel:massa -- ler` | Lê o catálogo visível da loja única (só GET) para `data/unificado/painel/visiveis-<data>.jsonl`. ~200 páginas, ~15–20 min. |
| `npm run painel:massa -- tags-cidade …` | Monta a fila das tags de cidade (§4). |
| `npm run painel:massa -- conferir --antes=… --depois=… --fila=…` | Compara duas leituras. Confere se as tags planejadas estão presentes, se os demais campos ficaram iguais e se nenhum produto fora da fila mudou. Sai com código 2 se algo divergir. |
| `npm run painel:massa -- progresso --fila=…` | Até onde a fila chegou, por GET, para retomar sem repetir nem pular. |

Para uma mudança nova que não seja de tags, monte a fila no mesmo formato (`{key, ids, campos}`) e libere o campo com `permitir`.

## 4. Receita: tags de cidade para o Order Bump "Por Tags"

**Objetivo:** quando uma camiseta de cidade vai para o carrinho, o bump sugere outra **da mesma cidade**. No modo "Por Tags" a INK casa os
produtos que têm a mesma tag participante.

**Tags de cada camiseta clássica (tipo 1) de estampa de cidade**, em modo substituir, sem repetição:

```
<cidade>, cidade-<slug>-<uf>, camiseta <cidade>, camiseta <estado>
tijucas, cidade-tijucas-sc, camiseta tijucas, camiseta santa catarina
```

- **A 1ª tag tem de ser o nome da cidade.** O site lê `tags[0]` para achar a cidade do **Gentílico** e da **Origem Localidade**
  (`resolveCity` em `src/lib/catalog/parse.ts`). Sem ela, o produto sai da página da cidade.
- **`cidade-<slug>-<uf>` é a tag do bump.** Leva a UF porque há cidades com o mesmo nome em estados diferentes.
- **As duas últimas são as tags de SEO** que o dono quis manter. As demais tags antigas foram descartadas.
- **DF:** cada região administrativa é um lugar (`cidade-taguatinga-df`, `cidade-ceilandia-df`…), e Brasília fica com `cidade-brasilia-df`.
- **"Feito em X" do Sul não tem UF no nome.** Quando X existe em dois estados (Turvo, Bom Jesus, Palmeira…), o estado sai do lote de
  criação, por faixa de ID: 4702–4705 mil PR, 4706–4712 mil RS, 4713–4717 mil SC.
- **Produtos migrados de Norte/CO** sem cidade no nome ou nas tags: a cidade sai do mapa da migração (`--mapa=…/mapa-antigo-novo.jsonl`).
- **Ficam fora:**
  - as camisetas de estado;
  - ~40 localidades, gentílicos e personalizadas sem cidade resolvível (lista em `…-fora.json`);
  - os tipos que não são Camiseta (Cropped, Infantil, Oversized…).
- **Cidade com o nome do estado** (Goiás-GO, Amapá-AP) fica com 3 tags: a INK junta a repetida.

**Para produtos novos**, porque modelo ou cidade criado depois nasce sem essas tags:

```bash
npm run painel:massa -- ler
npm run painel:massa -- tags-cidade --leitura=data/unificado/painel/visiveis-<data>.jsonl \
  --mapa=data/unificado/saida/20261005050850-ef5901c1d/mapa-antigo-novo.jsonl
# → fila só com os lugares que ainda não estão com as tags certas
```

Depois:
1. Na aba dedicada, abra `/user/dashboard/products_v2/mass_edit`, cole o `executor.js`, carregue a fila e rode `__massa.iniciar()`.
2. Ao terminar, rode `ler` de novo e depois `conferir` com as duas leituras e a fila.

**No bump**, configuração da INK feita pelo dono:
- modo **Por Tags**, marcando como participantes as tags `cidade-*` (são ~2.150 tags);
- enquanto uma cidade não tiver a tag, o bump sorteia ou não sugere nada. Por isso o modo **Por Categoria** (as `ZZ - <REG> - <UF>`) é o
  plano B.

## 5. Outras operações de painel já mapeadas

| Operação | Onde está |
|---|---|
| Imagem de vitrine (mockup "camiseta dobrada") por produto | `docs/migracao-ink/origens-mockups-painel-execucao.md` + `scripts/painel-mockups/executor.js` (abre a edição de cada produto num iframe e clica como a pessoa) |
| Visibilidade de categorias (ligar/desligar `ZZ - …`) | MCP: `origens_preview_category_visibility` → aprovação do dono → `origens_confirm_change` |
| Order Bump (Por Categoria / Por Tags, desconto, tags participantes) | Só na tela, pelo dono. O que o bump precisa dos produtos está na §4 |
| Renomear categoria | Só na tela |

Uma operação nova que virar rotina entra nesta tabela, com o fluxo observado e as travas.
