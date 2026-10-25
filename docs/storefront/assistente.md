# Assistente ("Ajuda")

O botão **Ajuda** no canto inferior direito do site e, pelo Worker, das páginas da INK. Nas páginas da INK ele fica no lugar do botão
"Ajuda?" e do link "Fale pelo Whatsapp" da própria INK, que somem enquanto o assistente estiver no ar. **Não usa IA** (mesma decisão do M10
do oria-worker): tudo o que ele responde vem da loja.

## O que ele responde, nesta ordem

1. **CPF, cartão ou senha**: recusa e não repete o texto. A recusa acontece já no navegador, antes de enviar, e o servidor recusa de novo.
2. **Pedido, rastreio, "não chegou"**: leva às páginas de pedidos da INK (`<loja>/orders/trackings` e `<loja>/orders`). Nunca consulta
   pedido.
3. **Troca e devolução**: a resposta cadastrada pela loja mais o botão "Pedir troca ou devolução" (`<loja>/orders`).
4. **"Falar com alguém"**: abre o WhatsApp da loja com a pergunta já escrita.
5. **Uma pergunta da base**: a resposta da loja, palavra por palavra, mais o botão escolhido no painel. As outras palavras pesam 3, a
   pergunta 2 e a resposta 1.
6. **Cidade, estado, coleção ou estampa**: a busca do próprio site (`globalSearchIndex`, com os apelidos). A ordem é cidade pelo nome
   exato ou apelido (até 3 peças reais e a página), coleção pelo nome e, por último, estampas pelas palavras inteiras do nome. Tenta
   também sinônimos (mamãe → mãe), o singular e o começo da palavra (abelha → abelh). Se o painel esconder as estampas de cidade da busca,
   o assistente também as esconde.
7. **Nada encontrado**: diz o que não achou, com as palavras da pessoa, e oferece o WhatsApp.

## A "mini inteligência" (regras, sem IA)

- **Conversa:** "obrigado", "tchau" e "beleza" recebem uma resposta curta e nunca viram busca. Um "oi, tem de Floripa?" já busca direto.
- **Erro de digitação em lugar:** "curitiva" vira "Você quis dizer Curitiba?". Só com um único nome próximo (1 letra até 6 letras, 2
  letras a partir de 7), nunca no chute entre dois.
- **Começo do nome de um lugar:** "joinvile" leva a Joinville quando só um lugar começa assim.
- **Palavra repetida:** "quero quero" é um nome (o pássaro), não "eu quero".
- **Categorias da INK:** além do menu, todas as categorias públicas da região com peças ("Dia dos Pais", quando pública). As ocultas
  na INK ficam de fora, pelas mesmas regras do menu.
- **Preço e tamanho sem resposta cadastrada:** diz onde a informação está (no preço de cada peça, no Guia de medidas). Nunca inventa
  número.
- **Seguimento, resolvido no navegador sem ir ao servidor:** "tem mais?" depois de estampas abre o link com todas. "Sim" depois de oferecer
  o WhatsApp abre o WhatsApp.
- **"Digitando…":** aparece antes de cada resposta, de 0,7 s a 1,8 s conforme o tamanho do texto, descontado o tempo que o servidor já
  levou.
- **WhatsApp a um toque:** fica no cabeçalho do chat sempre que a loja tem número (`whatsapp` no GET).

## Painel

**Atendimento › Assistente**, por região, publicado com ela:
- liga e desliga;
- WhatsApp do atendimento;
- mensagem de abertura;
- até 40 respostas, cada uma com pergunta, resposta, outras palavras e botão.

**Trazer perguntas da INK** lê uma vez as páginas públicas `/faq` e `/exchanges_and_returns` e sugere as palavras e o botão de cada
pergunta. Nada é salvo sem revisão. A INK recusa a leitura feita do servidor (403 do Railway, proteção contra robôs: de um
computador comum passa). Nesse caso o painel traz a cópia conferida em 24/10/2026 (`src/lib/assistant/ink-faq-copy.ts`) e diz de quando
ela é. Se o FAQ da INK mudar, atualize a cópia e as páginas salvas em `tests/fixtures/ink-faq` (o teste exige que as duas sejam iguais). A coluna **Testar** responde com o rascunho da tela e o catálogo real.

## Perguntas do assistente

**Atendimento › Perguntas do assistente** (`/admin/assistente/perguntas`), por região, nos últimos 7, 30 ou 90 dias:
- **Sem resposta:** "não encontrei", "não tenho essa resposta", pedido de mais detalhe e WhatsApp. Perguntas iguais escritas de jeitos
  diferentes ficam juntas, pela chave das palavras buscadas (sem acento, "tem", "estampa", "camiseta"). **Criar resposta** abre o
  Assistente com a pergunta numa resposta nova no fim da lista; falta escrever a resposta e salvar o rascunho.
- **Mais perguntadas:** tudo, menos saudação e "obrigado", com a resposta que recebeu.
- **Respostas da loja:** quantas vezes cada resposta publicada foi usada, e as que nunca foram.

O que fica guardado (tabela `assistant_question`, migração `0009_assistant_questions`):
- a pergunta, com e-mails e sequências de 6 dígitos ou mais (telefone, CEP, pedido, documento) trocados por `[e-mail]` e `[número]`;
- a região, se veio do site ou da INK (o Worker manda `x-origens-visitor`, o site não), o tipo da resposta, a resposta da base que foi
  usada e quantos cartões saíram;
- **nada do visitante:** nem IP, nem o hash do Worker, nem cookie. Mensagem com CPF, cartão ou senha fica só como "recusada", sem texto.

A gravação acontece depois da resposta sair (`after()` do Next) e nunca derruba a resposta. Antes da migração ser aplicada, o assistente
responde normal, a gravação é pulada (um aviso no log por hora) e a tela avisa que falta a migração. Linhas com mais de 90 dias são
apagadas pela própria aplicação, no máximo uma vez por hora. Não entram: o seguimento resolvido no navegador ("tem mais?", "sim"), o que o
navegador recusou antes de enviar, e as perguntas da coluna **Testar** do painel. No `cms:dev`, ficam na memória e somem ao reiniciar.

A política de privacidade (`/<região>/privacidade`, seção "Assistente “Ajuda”") diz o mesmo.

Aplicar a migração no Railway: `railway ssh --service useorigens-storefront -- npm run db:migrate` (`npm run db:status` antes, para ver
o que está pendente).

## Contrato

- `GET /api/assistente/<região>` devolve `{ v: 1, region, enabled, opening?, whatsapp? }`. O `whatsapp` é o link wa.me do atalho. Cache curto (60 s na CDN).
- `POST /api/assistente/<região>` recebe `{ message }` e devolve `AssistantReply` (`src/lib/assistant/engine.ts`). Tem `no-store` e
  limite por visitante (20 por minuto, 300 por dia) e no total (1.200 por minuto). O Worker manda `x-origens-visitor` (hash, nunca o IP).
- Depois de responder, o servidor guarda a pergunta para o painel (ver **Perguntas do assistente**). O texto nunca vai para o GA4: os
  eventos `origens_assistant_*` levam só o tipo da resposta e o que foi seguido.

## Desligar

- No painel: desligar e publicar. A INK volta a mostrar o "Ajuda?" e o WhatsApp dela.
- No servidor: `ASSISTANT=off` e um deploy. É o teto: desliga em tudo.
- Na INK: tirar `assistant` de `WIDGET_FEATURES` no Worker.
