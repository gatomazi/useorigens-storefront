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

## Bases com campo (só o sobrenome)

Uma camada de texto pode ter um **campo** (`slot` em `model.ts`): um modelo de texto com `{campo}`, como `NATAL DOS {sobrenome}`, um rótulo, um limite de caracteres e a caixa das letras (`upper`, `title` ou `none`). Se a base tem pelo menos uma camada com campo, a loja mostra **um input por campo** (camadas com o mesmo campo compartilham a resposta) e **trava todo o resto**: textos, fontes, cores e posições. O navegador envia só `{ sobrenome: "..." }`; o servidor monta os textos a partir da base.

- Aceita letras latinas (com todos os acentos do português), espaço, hífen, apóstrofo e ponto. Maiúsculas ou inicial maiúscula são aplicadas automaticamente; em `title`, "da", "dos", "de" etc. ficam minúsculos no meio do nome.
- **Caixa fixa** (`boxWidth`): o texto alinha dentro da caixa, então um nome centralizado continua no eixo da arte, e diminui para caber quando é longo. A linha de base é ancorada na altura do "H", para acentos não deslocarem a composição; ao diminuir, o centro vertical se mantém.
- **Arco** (`arc`, raio em px): o texto é desenhado letra a letra num arco para cima, centrado na caixa; a largura da caixa vira o maior arco antes de diminuir. Não aplica pares de kerning entre letras.
- **Contorno** (`stroke`, px): contorno na cor do próprio texto, para encorpar uma fonte leve.
- **"dos" automático** (`dropParticle`): onde a arte já diz "dos" ("NATAL DOS {sobrenome}", ou "ceia dos" desenhado acima), um "da/das/do/dos" no começo da resposta sai, então "dos Santos" vira "NATAL DOS SANTOS". "De", "Di" e "Du" ficam, porque fazem parte de sobrenomes como De Lucca e Di Napoli. "Dos" serve para qualquer sobrenome: é o plural da família ("os Silva", "os Oliveira").
- **Quebra de linha** (`maxLines`): sobrenome composto vira linhas equilibradas, com as partículas presas à palavra seguinte ("Silva Pereira / dos Santos", "Costa / e Silva"). As linhas extras entram embaixo; no arco, em arcos concêntricos menores.
- **Arte que desce** (`pushedBy` na camada de imagem): a imagem desce a altura das linhas extras do texto indicado, então a arte embaixo do nome acompanha a quebra.
- O resumo da solicitação mostra o que o cliente digitou e o **texto como sai na arte**.

O estúdio preserva esses campos ao abrir e salvar, e renderiza arco, contorno e a arte que desce, mas ainda não tem controles para editá-los: ajuste pelo `.json`.

### Natal em família

As artes de `~/Downloads/Estampas Familia Natal 2` vêm em pares com o mesmo desenho: o PNG ímpar é para **camiseta clara** (tinta escura) e o par para **camiseta escura** (tinta clara). Viram bases com `scripts/natal-bases.py`:

```zsh
python3 scripts/natal-bases.py "$HOME/Downloads/Estampas Familia Natal 2" output/natal-bases --preview   # pillow, numpy, scipy
```

Sai um `<slug>-clara.origens.json` e um `<slug>-escura.origens.json` por arte, com "· camiseta clara/escura" no nome. A cor do texto novo é lida do sobrenome original de cada PNG, e a posição também é medida em cada um (as duas versões diferem alguns pixels). Os critérios de apagar usam posição e tamanho, não cor, e o script para com erro se não encontrar o sobrenome no lugar esperado.

O script apaga o sobrenome do PNG (uma zona em volta do nome, incluindo o halo quase transparente que as artes trazem, preservando árvores, estrela, mesa etc.) e põe no lugar a camada com o campo. Medidas, fontes e zonas ficam no topo do script, medidas no PNG da camiseta clara.

| PNGs | Base | Texto | Fonte |
| --- | --- | --- | --- |
| 1, 2 | universitário | `{SOBRENOME}` em arco, com contorno; composto quebra em 2 arcos e a arte desce | Graduate |
| 3, 4 | eu vim pela ceia | `NATAL DOS {SOBRENOME}` | Montserrat SemiBold |
| 5, 6 | eu vim pelo presente | `NATAL DOS {SOBRENOME}` | Montserrat SemiBold |
| 7, 8 | ceia dos | `{Sobrenome}` | Caveat |
| 9, 10 | árvore (peito) | `{SOBRENOME}` espaçado | Montserrat SemiBold |
| 11, 12 | pavê ou pacumê | `NATAL DOS {SOBRENOME}` | Caveat Brush |

As quatro fontes (OFL) ficam em `assets/print-studio/fonts/` e também entram na biblioteca do estúdio. A Graduate é mais leve e larga que a letra universitária original; o contorno compensa parte disso. Para trocar por outra fonte, coloque o arquivo em `assets/print-studio/fonts/`, registre em `font-server.ts` e no `FONTS` do script, e gere de novo.

Para publicar em produção, em cada `.origens.json`: `/admin/estampas` → **Importar modelo** → conferir → **Salvar como modelo**; depois `/admin/personalizacao` → novo modelo (coleção, mockup) → **Base do estúdio** → salvar → publicar o modelo.

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
