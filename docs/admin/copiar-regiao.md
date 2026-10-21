# Copiar configurações de outra região

No admin, selecione a **região de destino** no topo. Abra **Copiar de outra região** na tela que deseja configurar:

- **Home · Seções:** substitui a home do tema em edição no rascunho, incluindo ordem, textos, imagens e configurações das seções.
- **Navegação:** substitui rótulos, ordem e visibilidade da navegação e o menu de coleções.
- **Coleções:** substitui apenas o menu de coleções (topo, ocultas e adicionadas a Categorias).
- **Aparência:** usa as oito cores efetivas da origem como paleta própria da região, inclusive cores herdadas ou padrões que a origem usa.
- **Cupons e promoções:** substitui a lista por cópias desativadas, preservando textos, códigos e períodos para revisão.
- **Páginas:** escolhe uma página de origem e cria uma página nova, com endereço único e indexação desativada.
- **Personalização:** escolhe um modelo de origem e cria um modelo novo e desativado, preservando campos, grupos de linhas e imagens.

Escolha a região de origem e a versão: **Configuração atual** inclui o rascunho salvo; **Publicada** usa o que está publicado ou o padrão inicial quando ainda não houve publicação. É necessário ter acesso às duas regiões.

Para Home e Aparência, a origem usa o tema em uso na versão escolhida; a identificação desse tema aparece na seleção. O destino recebe a cópia no tema que está em edição no painel. O outro tema e a seleção do tema em uso são preservados. Trocar de tema depois da revisão exige revisar a cópia novamente.

Quando houver coleções da INK, confira as associações com coleções da loja de destino. Nomes ou slugs iguais geram uma sugestão somente quando a correspondência é inequívoca. IDs iguais de lojas diferentes não indicam equivalência. Coleções usadas para seções precisam de pelo menos três produtos; links para a INK precisam de coleções públicas. Coleções internas necessárias são habilitadas no rascunho e essa alteração aparece na revisão.

As associações usam a loja que atende o destino no modo comercial atual, inclusive quando as regiões compartilham a loja única. A exibição dos produtos continua respeitando a região de cada produto.

Clique em **Revisar cópia**, confira a estrutura e os ajustes e depois em **Confirmar cópia no rascunho**. A origem é preservada. A confirmação não publica nada: revise e publique o destino pelo fluxo normal. Páginas e modelos continuam sendo publicados individualmente.

## Ajustes regionais

Os textos e as imagens são mantidos como base; revise menções à região de origem. Links internos passam para a região de destino. Um botão sem página ou estado equivalente é retirado; em grades, o bloco é preservado e leva à home do destino até você ajustar o link. Links externos para lojas regionais também passam a apontar para a home do destino, sem inventar endereços de produtos.

Os produtos em destaque do hero continuam sendo os do destino, ou ficam vazios quando ele não tem seleção. Capas de estados da origem são retiradas. A ordenação e os produtos ocultos das coleções continuam seguindo a configuração do destino. Seções cuja fonte é uma seleção manual de IDs de produtos são copiadas desativadas e com a seleção vazia; refaça essa curadoria no destino. Um card de personalização usa um modelo ativo com o mesmo endereço no destino; sem equivalente, o card é retirado para ser vinculado novamente. O checkout de um modelo da INK deve ser escolhido na loja de destino.

Tracking, lançamento da região, pódio, configurações globais, solicitações de clientes e conteúdos de outras telas são preservados. A revisão é invalidada se a origem, o destino, as associações ou o catálogo relevante mudarem antes da confirmação. A gravação usa a mesma trava otimista dos demais editores, evitando sobrescrever alterações concorrentes.
