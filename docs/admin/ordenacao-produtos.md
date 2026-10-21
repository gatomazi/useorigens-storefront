# Ordenação de produtos

As páginas de coleção que já oferecem filtros também permitem ordenar por **Novidades** e **Mais vendidas**, além de ordem da coleção e preço. A busca e os filtros de peça, estado, cidade e estilo continuam combinando com a ordenação escolhida.

- **Novidades:** data de cadastro do produto na INK, da mais recente para a mais antiga. A data de sincronização não é usada como data de lançamento.
- **Mais vendidas:** unidades líquidas vendidas nos últimos 30 dias, da maior para a menor, usando a mesma apuração de pedidos elegíveis do Pódio. A opção pública só aparece com apuração atualizada (até 72 horas); sem ela, um padrão configurado como Mais vendidas volta à ordem da fonte. Os totais de vendas não são enviados ao navegador.
- **Menor preço / Maior preço:** preço atual do produto, incluindo o preço promocional quando houver.
- **Ordem da coleção:** ordem original da fonte ou a ordem manual da coleção na região.

Empates preservam a ordem original. Datas e preços ausentes ficam depois dos conhecidos. Vendas ausentes são tratadas como zero. As datas de cadastro passam a ser preservadas no próximo sync de catálogo; snapshots antigos continuam funcionando e mantêm a ordem original entre produtos sem data.

## Padrão por carrossel ou grade

No editor da seção, em **Produtos → Ordenação padrão desta seção**, escolha a ordem. Na home, **Usar ordem original da fonte** mantém a curadoria atual. Dentro de uma página, **Usar padrão da página** segue a escolha feita para aquela página. Uma ordem explícita na seção tem prioridade sobre o padrão da página.

A ordenação é aplicada ao conjunto completo de produtos disponíveis antes de limitar o número de cards. Nas curadorias editoriais, os conjuntos completos das linhas Lenda e Fala daqui são considerados antes de preencher as vitrines de seis e doze cards, respectivamente. As curadorias fechadas continuam restritas aos produtos que fazem parte delas.

Se a coleção tiver ordem manual, ela tem prioridade sobre os padrões automáticos da seção e da página. Produtos ocultos continuam excluídos. Retirar a ordem manual permite que a ordenação automática escolhida volte a valer.

O feed da Uma Penca não informa datas de cadastro nem vendas. Nessa fonte, Novidades e Mais vendidas preservam a ordem do feed; preço pode ser ordenado com os dados disponíveis.

## Padrão por página

Em **Páginas → Editar → Ordenação padrão dos produtos da página**, escolha a ordem inicial. Ela vale para as seções que seguem o padrão da página e para a seleção inicial do filtro de ordenação na grade paginada. Para uma coleção que ainda usa página automática, use **Personalizar página** na Biblioteca de coleções e configure o padrão na página criada.

A grade já chega ordenada no HTML inicial, antes da paginação. O cliente pode mudar a ordenação depois, inclusive voltar explicitamente à ordem da coleção. Voltar ao padrão sem filtros restaura a grade e a paginação desenhadas pelo servidor, sem uma busca extra.

As escolhas são salvas no rascunho e só chegam à loja depois da publicação da home ou da página correspondente. Duplicar páginas/seções e **Copiar de outra região** preservam os padrões de ordenação.
