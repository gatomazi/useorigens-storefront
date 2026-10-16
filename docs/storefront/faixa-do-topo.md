# Faixa do topo (datas sazonais: Black Friday, Natal)

A faixa preta acima do cabeçalho passa a ser editável **por região** no painel (**Marketing → Faixa do topo**, `/admin/faixa`). As mesmas mensagens
aparecem na loja e, pelo Worker (feature `top-bar`), na faixa preta do cabeçalho das páginas da INK.

## No painel

- **Como as mensagens aparecem**: **passando** (letreiro, o padrão, no estilo da Aphago: todas numa linha que corre da direita para a esquerda,
  separadas por um ponto, e para sob o mouse ou com o foco) ou **uma de cada vez** (troca a cada 5 s). Quem desativou animações no sistema vê só a primeira, parada.
- **Cores da faixa**: fundo e fonte da faixa inteira (presets Vermelho Natal, Verde Natal, Dourado, Black Friday, ou qualquer cor). Valem na loja e na INK
  enquanto houver mensagem no ar; sem cor, a faixa preta de sempre. Contraste abaixo de 3:1 não salva; abaixo de 4,5:1 o editor avisa e sugere fonte
  branca ou preta.
- **Prazo de produção da INK (dias úteis)**: o "DLO". É só o tempo de produção, porque a entrega depende do CEP (a INK calcula no carrinho). Aparece no
  texto pelo marcador `{producao}` ("7 dias úteis").
- **Mensagens** (até 10): texto de uma linha (até 90 caracteres), link opcional para uma página da própria região (`/sul/h/natal`), início e fim
  opcionais em horário de Brasília, liga/desliga e ordem.
- **Marcadores**: `{producao}` precisa do prazo preenchido; `{faltam}` precisa de data de fim e vira "faltam 3 dias", "falta 1 dia" ou "último dia",
  em dias do calendário de Brasília (o último dia é o do último minuto no ar: fim em 07/12 00:00 = "até 06/12"). Marcador desconhecido bloqueia o salvamento.
- **Modelos**: "Black Friday" (sexta da Black Friday 00:00 até o fim da Cyber Monday, com `{faltam}`) e "prazo de Natal" ("Peça até 06/12…", fim em
  07/12 00:00). Dá para editar tudo depois de inserir.
- Acima de 60 caracteres (já preenchido), o editor avisa que o texto pode quebrar em duas linhas no celular.
- **Prévia**: as mensagens que estariam no ar num momento escolhido (para conferir a Black Friday e o Natal antes de chegarem).
- Salvar grava **rascunho**. A faixa vai junto com a publicação da região, e a tela Publicar lista cada mudança ("Faixa do topo: mensagem … adicionada").

## Na loja

- Sem mensagem no ar = a faixa padrão ("N cidades do Sul em camiseta…"), como antes.
- As páginas ficam em cache (ISR, 1 h), por isso a página leva a **agenda inteira** (as mensagens no ar e as agendadas, nunca as encerradas). O navegador
  decide com o próprio relógio e confere de novo a cada 30 s: a Black Friday começa à meia-noite, não quando o cache vencer. O primeiro desenho usa o
  instante em que a página foi gerada (igual ao HTML, sem erro de hidratação).
- Letreiro: dois grupos iguais lado a lado e a trilha andando metade da largura (laço sem emenda); cada grupo repete as mensagens até cobrir a faixa e a
  duração acompanha a largura (45 px/s), então a velocidade é a mesma com uma ou dez mensagens. Só a primeira passagem é lida pelo leitor de tela e
  alcançada pelo Tab. "Uma de cada vez": troca a cada 5 s. Os dois param sob o ponteiro e com o foco; com `prefers-reduced-motion`, fica a primeira, parada.
- Emojis funcionam no texto (🎄 🚚).
- Código: `src/lib/site-config/top-bar-schema.ts` (contrato), `top-bar.ts` (regras puras), `top-bar-public.ts`, `src/components/layout/TopBarMessages.tsx`,
  `AnnouncementBar` em `SiteChrome.tsx`, `src/components/admin/TopBarEditor.tsx`, `src/lib/admin/top-bar-form.ts`. Testes: `tests/unit/top-bar.test.ts`.

## Para a INK (Worker)

- `GET /api/top-bar/<região>`: público, somente leitura, cache de 30 s. Contrato `v: 1`:
  `{ v: 1, region, style: "marquee" | "rotate", colors?: { background, text }, messages: [{ id, text, href?, endsAt? }] }`, só as mensagens no ar, com o texto **já preenchido**.
- O Worker (`use-origens-workers`, `src/top-bar-gateway.js` + `src/loader/top-bar.js`, feature opt-in `top-bar`) re-serve isso em `/__origens/top-bar`
  e troca as frases nativas da faixa da INK pelas nossas. Sem mensagem no ar, com erro ou com a feature desligada, a faixa da INK fica como está.
  Na loja única, cada visitante vê a faixa da região dele (a mesma regra da navbar).

## Publicação

1. Mergear e publicar o storefront (a rota `/api/top-bar/<região>` precisa existir antes do Worker).
2. Preencher e publicar a faixa no painel.
3. Publicar o Worker da Sul com `top-bar` somado às features que já estão no ar.

## Capturas

`docs/screenshots/faixa-do-topo/`: loja com o letreiro (desktop e celular), movimento reduzido, painel e tela Publicar.
