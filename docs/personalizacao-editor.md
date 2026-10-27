# Editor de personalização do cliente

Um modelo de personalização pode usar uma base do [Estúdio de estampas](estampas.md). Nesse modo, o cliente edita a arte em `/{region}/personalizar/{slug}`, confere a prévia e envia uma solicitação para a equipe. O envio não é uma compra, não reserva um produto, não cria produtos automaticamente e não envia mensagens ao cliente.

## Preparar e publicar

1. Em `/admin/estampas`, prepare a composição e use **Salvar como modelo**. O salvamento cria uma base imutável com suas camadas, imagens e fontes incorporadas.
2. Abra `/admin/personalizacao/[id]` e escolha essa base em **Base do estúdio**, na seção **Editor de arte para o cliente**.
3. Salve o rascunho do modelo de personalização. Use a prévia interativa para trocar textos, fontes e cores e testar o formulário. **Testar o envio (prévia)** não registra uma solicitação.
4. Publique o modelo de personalização para disponibilizar o vínculo na loja, respeitando os requisitos de ativação já existentes.

Quando há uma base vinculada, os controles da arte substituem os campos de texto e o grupo de linhas do formulário público. Sem vínculo, o formulário anterior continua em uso. Os campos de contato, a confirmação de uso do contato e o acompanhamento da solicitação continuam iguais.

## O que o cliente pode editar

- Cada camada de texto visível oferece texto, fonte e cor. São permitidos até **200 caracteres por texto**, sem ultrapassar a quantidade de linhas daquele texto na base.
- **Fonte** oferece as fontes padrão do estúdio e as fontes incorporadas à base. **Mont** aparece uma única vez; ao escolhê-la, **Variação** mostra seus cortes incorporados àquela base, como **Extraleve**, **Regular**, **Regular itálico**, **Negrito** e **Pesado**. Cada escolha usa o arquivo real do corte. O cliente não envia novos arquivos de fonte nem acessa cortes ausentes da base.
- Posições, logos, imagens e dimensões seguem a composição original. Textos longos diminuem proporcionalmente para caber na largura disponível.
- A prévia acompanha as escolhas. **Fundo para visualizar** serve apenas para conferir o contraste; não muda a cor do produto nem compõe o PNG.

O cliente informa nome, ao menos um canal de contato e a confirmação solicitada. **Salvar e enviar solicitação** guarda as escolhas na fila existente e mostra uma referência. O link **Ver minha solicitação** também apresenta a prévia da arte, além do resumo e do andamento. Não há galeria pública, upload de PNG pelo cliente nem geração de produto nessa etapa.

## Atender no estúdio

Em `/admin/personalizacao/solicitacoes/[id]`, a equipe vê a composição em canvas, o resumo e **Abrir arte no estúdio**. O link abre `/admin/estampas?solicitacao=ID`; o servidor verifica a permissão para editar a região da solicitação antes de carregar a arte.

O estúdio inicia com a base e as escolhas recebidas. Se houver um rascunho local dessa solicitação no navegador, ele é restaurado. Esse rascunho fica isolado do rascunho geral e dos rascunhos de outras solicitações; ele não substitui o salvamento no servidor.

**Salvar estampa** cria uma nova arte independente e preserva a composição original enviada pelo cliente. A equipe gera e salva o PNG pelo estúdio, prepara o produto na loja de origem e realiza o contato manualmente, usando o fluxo de atendimento existente.

## Dados e conservação das bases

A solicitação guarda `templateId`, `templateName` e as edições canônicas de cada texto, incluindo identificadores e nomes das fontes e cores. Esses dados ficam no JSON de valores já existente: `values.artwork` no store em arquivo e na coluna `request_values` do Postgres. A extensão não exige migração. Novas escolhas explícitas de variação podem guardar o peso confiável da fonte na solicitação; solicitações e composições antigas preservam seu fallback de peso.

A composição é reconstruída a partir da base imutável. Referências de imagem e camadas ocultas são excluídas da base entregue ao cliente; a biblioteca privada do estúdio não se torna uma galeria pública. Preserve as bases vinculadas e inclua o diretório de estampas no backup descrito em [Armazenamento e Railway](estampas.md#armazenamento-e-railway).

Se a base estiver ausente ou inválida, a página de personalização não permite enviar uma nova solicitação. Nas solicitações já salvas, o resumo permanece disponível, mas a prévia e a abertura no estúdio dependem da base original.

## Verificação desta extensão

Na implementação inicial, passaram o typecheck, o ESLint direcionado e **189 testes em 17 arquivos**, incluindo a ação pública, validação da arte, os dois backends de solicitações, fontes, estúdio, schema e CMS. A revisão estática confirmou as correções de normalização dos textos e recuperação do rascunho da solicitação.

No ajuste da família Mont em 20/10/2026, passaram o typecheck, o ESLint direcionado e **19 testes em 5 arquivos afetados**; o detector mecânico não apontou problemas. A prévia SSR local respondeu HTTP 200, com uma opção Mont em **Fonte** por texto. Essa verificação foi limitada ao ajuste de fontes e não representa uma nova execução da bateria de 189 testes nem uma validação visual.

A comparação estática conferiu o uso da tipografia existente (`t-h3`, `t-small`, `t-label`), dos botões da loja e do painel e de controles retangulares com borda e foco visível. A extensão herda os tokens regionais e a linguagem de `globals.css`; não estabelece uma nova identidade visual ou um novo sistema de design.

**A validação visual permanece pendente.** Não há screenshots válidos nem E2E de navegador desta extensão: a navegação local pelo navegador não foi autorizada nesta sessão. A revisão estática e os testes automatizados não comprovam o resultado renderizado em desktop ou celular.
