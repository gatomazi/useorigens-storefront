# Faixa do topo (datas sazonais: Black Friday, Natal)

A faixa preta acima do cabeçalho passa a ser editável **por região** no painel (**Marketing → Faixa do topo**, `/admin/faixa`). As mesmas mensagens
aparecem na loja e, pelo Worker (feature `top-bar`), na faixa preta do cabeçalho das páginas da INK.

## No painel

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
- Com mais de uma no ar, elas se revezam a cada 5 s na ordem do painel, com pausa sob o ponteiro e com o foco. Com `prefers-reduced-motion`, fica a primeira.
- Código: `src/lib/site-config/top-bar-schema.ts` (contrato), `top-bar.ts` (regras puras), `top-bar-public.ts`, `src/components/layout/TopBarMessages.tsx`,
  `AnnouncementBar` em `SiteChrome.tsx`, `src/components/admin/TopBarEditor.tsx`, `src/lib/admin/top-bar-form.ts`. Testes: `tests/unit/top-bar.test.ts`.

## Para a INK (Worker)

- `GET /api/top-bar/<região>`: público, somente leitura, cache de 30 s. Contrato `v: 1`:
  `{ v: 1, region, messages: [{ id, text, href?, endsAt? }] }`, só as mensagens no ar, com o texto **já preenchido**.
- O Worker (`use-origens-workers`, `src/top-bar-gateway.js` + `src/loader/top-bar.js`, feature opt-in `top-bar`) re-serve isso em `/__origens/top-bar`
  e troca as frases nativas da faixa da INK pelas nossas. Sem mensagem no ar, com erro ou com a feature desligada, a faixa da INK fica como está.
  Na loja única, cada visitante vê a faixa da região dele (a mesma regra da navbar).

## Publicação

1. Mergear e publicar o storefront (a rota `/api/top-bar/<região>` precisa existir antes do Worker).
2. Preencher e publicar a faixa no painel.
3. Publicar o Worker da Sul com `top-bar` somado às features que já estão no ar.
