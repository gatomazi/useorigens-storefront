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

## Painel

**Atendimento › Assistente**, por região, publicado com ela:
- liga e desliga;
- WhatsApp do atendimento;
- mensagem de abertura;
- até 40 respostas, cada uma com pergunta, resposta, outras palavras e botão.

**Trazer perguntas da INK** lê uma vez as páginas públicas `/faq` e `/exchanges_and_returns` e sugere as palavras e o botão de cada
pergunta. Nada é salvo sem revisão. A coluna **Testar** responde com o rascunho da tela e o catálogo real.

## Contrato

- `GET /api/assistente/<região>` devolve `{ v: 1, region, enabled, opening?, whatsapp? }`. Cache curto (60 s na CDN).
- `POST /api/assistente/<região>` recebe `{ message }` e devolve `AssistantReply` (`src/lib/assistant/engine.ts`). Tem `no-store` e
  limite por visitante (20 por minuto, 300 por dia) e no total (1.200 por minuto). O Worker manda `x-origens-visitor` (hash, nunca o IP).
- O texto digitado não é guardado nem registrado, e não vai para o GA4. Os eventos `origens_assistant_*` levam só o tipo da resposta e o
  que foi seguido.

## Desligar

- No painel: desligar e publicar. A INK volta a mostrar o "Ajuda?" e o WhatsApp dela.
- No servidor: `ASSISTANT=off` e um deploy. É o teto: desliga em tudo.
- Na INK: tirar `assistant` de `WIDGET_FEATURES` no Worker.
