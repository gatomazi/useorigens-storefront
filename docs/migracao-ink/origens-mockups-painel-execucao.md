# Use Origens — ativação dos mockups pelo painel INK (Camiseta base Norte/CO, produtos ocultos)

Execução iniciada em 05/10/2026. Base: reconciliação `20261005050850-ef5901c1d` (`origens-ink-reconciliacao.md`).
Os números atualizados estão em `npm run mockups:fila -- status`. Os da §5 são uma fotografia.

## 1. Contexto e escopo

- Os produtos Norte/CO migrados para a loja Sul estão **ocultos de propósito**: as lojas regionais ainda operam, e a publicação só
  acontece na migração.
- A **imagem de vitrine** (o `main_image_url` do produto) é definida no painel. A criação pela API não faz essa etapa. Por isso, mockup
  pendente é uma **etapa de painel**, não algo que a API resolva.
- Escopo desta rodada: **só a Camiseta base** (`product_type.id = 1`). Infantil, Oversized, Peruano, Body, Regata, Cropped, Hoodie e
  Suéter ficam fora.
- Fora da automação:
  - reaplicar artes pela API;
  - desativar ou recriar variantes;
  - criar, copiar ou excluir produtos;
  - publicar;
  - mudar preço, slug, nome, categorias ou estampa.
- As linhas Identidade, DDD, Made In e similares serão **criadas manualmente pelo usuário**, porque exigem ajuste individual na grade.

## 2. O fluxo observado no painel

1. Abrir a edição: `https://reserva.ink/user/dashboard/products_v2/<id>/edit`. O usuário precisa estar logado, na loja Use Sul.
2. Ir à seção **Imagem da vitrine**. A cor padrão é a Preta. O 2º mockup da 1ª linha, a **camiseta dobrada**, é o rádio
   `showcase_image_visual` de valor **114**.
3. O painel **compõe a estampa sobre os mockups no navegador, aos poucos**: cada miniatura vira uma URL `blob:` quando fica pronta. A do
   114 levou de 70 s a 4 min. Se o 114 for clicado antes disso, o painel abre o alerta *"Para criar a imagem de vitrine dessa cor e
   modelo, você precisa aplicar uma estampa na etapa anterior. Se já aplicou, aguarde a imagem carregar e tente novamente."*
4. Clicar no 114 preenche `product_v2[showcase_image_id] = 114`.
5. Clicar em **Salvar Produto**. Esse botão reenvia o formulário inteiro com os mesmos valores que já estavam na tela. Conferido antes do
   primeiro salvamento:
   - "Valor do produto" (`id=product_price`, que o painel nomeia `product_v2[promotion_label]`) = preço atual;
   - "Valor Promocional" vazio;
   - **"Disponibilizar na loja" desmarcado**;
   - categorias, tipo e nome iguais;
   - nenhuma estampa editada.
6. Na amostra, a imagem apareceu **imediatamente** no `main_image_url` da API. O aviso do painel fala em até 30 min.

## 3. Ferramentas

| Peça | O que faz |
|---|---|
| `scripts/ink-mockups-fila.mts` (`npm run mockups:fila -- …`) | Fila persistente por ID, com checkpoint em `data/unificado/mockups/fila.json` (gravação atômica). Comandos: `montar` (a partir da reconciliação; recusa sobrescrever), `conferir` (**só GET**: imagem, visibilidade, tipo, preço, slug, nome; guarda o "antes" e o "depois"; interrompe com código 2 se houver mudança comercial), `proximos`, `marcar`, `status`. |
| `scripts/painel-mockups/executor.js` | Injetado na aba do painel pelo Claude in Chrome. Abre cada ID num iframe da mesma origem e repete o fluxo da §2. Faz `paralelo` produtos ao mesmo tempo, na mesma aba e na mesma loja. Guarda o resultado em `localStorage['__mockups']`, sem nenhum dado de sessão. |

Travas do executor, **antes** de clicar (se uma falhar, o produto não é salvo):
- o formulário aberto é do ID pedido;
- o tipo é 1;
- "Disponibilizar na loja" está desmarcado;
- o mockup 114 já está composto (`blob:`);
- não houve nenhum alerta do painel;
- `showcase_image_id` passou a ser 114 depois do clique.

Os `alert` e `confirm` do painel são interceptados e registrados, com `confirm` respondendo Cancelar, para nunca travar a aba.
Sessão expirada interrompe o lote.

## 4. Como retomar sem repetir

```bash
cd ~/projects/useorigens
npm run mockups:fila -- status                         # onde parou
npm run mockups:fila -- conferir --status=acionado     # confirma pela API o que o painel salvou (acionado → concluido)
jq -c '[.itens[]|select(.status=="pendente")|.id][0:300]' data/unificado/mockups/fila.json   # próximo bloco, em ordem de prioridade
```

No Chrome, com o grupo de abas do Claude e o painel logado na Use Sul:
1. injetar `scripts/painel-mockups/executor.js` (`javascript_tool`);
2. rodar `__mockups.iniciar(<bloco>, 2500, 2)`, ou, com a fila já andando, `__mockups.adicionar('<ids separados por espaço>', <n>, <soma>)`.
   O bloco, a contagem e a soma saem de:
   `jq -r '[.itens[]|select(.status=="pendente")|.id][0:500]|"\(join(" "))\n\(length)\n\(map(tonumber)|add)"' data/unificado/mockups/fila.json`.
   O executor recusa o bloco se contagem, soma ou unicidade não baterem. Essa trava existe porque, em 05/10, uma lista transcrita com
   erro gerou IDs que não existiam na fila; eles foram descartados antes de qualquer processamento;
3. acompanhar com `__mockups.estado()`;
4. para parar sem cortar um salvamento no meio: `__mockups.parar = true` (cada iframe termina o produto atual e para).

Os IDs que o executor marcar como `acionado` vão para a fila com `npm run mockups:fila -- marcar <id> acionado` e depois passam pelo
`conferir`. Um ID concluído na fila **não volta** para o bloco, porque o bloco só contém `pendente`. O executor também pula IDs já
acionados no `localStorage`.

## 5. Resultado final

Lote encerrado em 08/10/2026, às 18h59 UTC, depois de rodar de 05/10 a 08/10, incluindo as madrugadas.
Os números vêm de `npm run mockups:fila -- status` e de `jq` sobre `fila.json`:

| | Quantidade |
|---|---:|
| Elegíveis (Camiseta base CO/NO, oculta, sem imagem) | 3.263 |
| **Concluídos (imagem presente, conferida pela API)** | **3.262** |
| Bloqueados | 1 (`4944770`) |
| Dispensados (já tinham imagem) | 0 |
| Pendentes | 0 |

Conferência final dos 3.262 concluídos (campos `antes` e `depois` do `fila.json`), com zero ocorrências em todos os itens:
- sem imagem: 0;
- `visible_in_store=true`: 0;
- `status` diferente de `not_published`: 0;
- preço alterado: 0;
- slug alterado: 0;
- nome alterado: 0.

O `conferir` nunca interrompeu o lote por mudança comercial.

**Lacunas encontradas e fechadas:** na sincronização final, a diferença entre o `fila.json` e os resultados do executor mostrou 46
pendentes que nunca tinham entrado em nenhum bloco:
- 10 encontrados antes;
- 36 no fim: `4959750`, `4960349`–`4960381`, `4960465` e `4961240`.

Todos foram processados e conferidos. Lição: antes de declarar o fim, **sempre** cruzar `fila.json` (pendentes) com
`__mockups.resultados`, porque os blocos montados à mão podem pular IDs.

**Bloqueio:** `4944770` (Três Ranchos \| Coordenadas GO). O produto tem só 54 variantes: o Masculino está sem as cores escuras e o
Feminino só tem a Preta. Não existe estampa na Clássica Preta, e o painel recusa a vitrine. Corrigir exige reconfigurar estampa e
variantes, o que está fora do escopo. É o **único** caso na fila: os outros 3.262 têm as 108 variantes.

**Fora da fila por identidade ambígua:** `4961261` (Maraã \| Origem AM).

**Escopo:** o comando `acionados` recusa qualquer ID fora da fila, e nenhum foi aceito. Nenhum ID fora da fila foi salvo. Uma
expansão com `seq` no macOS gerou IDs em notação científica (`4.96035e+06`). O `acionados` os recusou como "FORA DA FILA", e o
registro foi refeito com os IDs corretos. Use `node`, não `seq`, para expandir faixas.

**Evidência de que continuaram ocultos:** todos os 3.262 produtos, conferidos pela API depois de salvar, têm
`visible_in_store=false` e `status=not_published`, com preço, nome e slug iguais ao "antes" (`fila.json`, campos `antes` e `depois`).

## 6. Limitações

1. **A aba do painel precisa ficar visível.** Com ela em segundo plano, o Chrome suspende a renderização que compõe as estampas. Medido
   em 05/10:
   - 3 em paralelo com a aba visível: cerca de 40 produtos/hora;
   - 6 em paralelo com a aba oculta: cerca de 1 produto a cada 4 min, e 5 iframes nem renderizaram o formulário.

   Isso dá dezenas de horas para o lote todo. Ele precisa de outras sessões; a fila e o checkpoint permitem retomar a qualquer momento.
2. **Paralelismo:** com 6 em paralelo, a máquina não aguentou (erros de formulário não renderizado, sem nada salvo). Com a aba oculta, o
   padrão é 2. Com a janela visível, vale testar 3.
3. **Degradação da aba:** depois de algumas horas, o ritmo cai e começam os "estampa não composta em 4 min" e as recriações pelo watchdog.
   Isso foi medido em 05/10, por volta das 20h UTC. O remédio:
   - `__mockups.parar = true` e esperar o produto atual de cada iframe terminar;
   - recarregar a aba do painel;
   - reinjetar o executor;
   - rodar `__mockups.iniciar(JSON.parse(localStorage.getItem('__mockups_fila')), 2500, 4)`.

   Os resultados e a fila sobrevivem ao recarregamento. Com 4 em paralelo e o watchdog de 10 min, o ritmo ficou em 40–70/h.
4. **Resizing:** o relatório do `migracao-verificar.mjs` (modo leitura) acusou **1** peça presa em `resizing`, uma Cropped, fora do
   escopo. Não houve reparo pela API.
5. **Ondas de 503 da INK** (Heroku "Application Error"): sob carga, o painel devolve 503 em sequência, e o executor registra
   "formulário não é do id … (undefined)". São transitórios. O `__checar` devolve esses IDs à fila, e eles passam na nova tentativa.
   Em ondas fortes, baixar para 1 em paralelo com pausa de 8 s por alguns minutos.
6. **Travamento do renderer com 4 iframes:** em 08/10, o Chrome congelou a aba, com o CDP `Runtime.evaluate` dando timeout de 45 s,
   depois de cerca de 30 a 35 min de sessão com 4 em paralelo. Antes de congelar, o ritmo cai e surgem "estampa não composta em 4 min".
   Procedimento:
   - recarregar preventivamente a cada cerca de 25 min (com 2 em paralelo, a cada cerca de 40 min);
   - depois de qualquer travamento, conferir quais IDs estavam em curso e não constam nem em `resultados` nem em `__mockups_fila`,
     porque eles se perdem com o recarregamento, e recolocá-los à frente da fila.

   Ritmo saudável com 4 em paralelo: cerca de 8 produtos a cada 5 min, ou seja, cerca de 95 por hora.
7. **Energia:** para rodar de madrugada, usar `caffeinate -dimsu -t 43200` e deixar a janela do Chrome visível, sem minimizar.
