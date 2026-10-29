# Seguir a Sul

A Sul é a base. Norte e Centro-Oeste podem **seguir a Sul** parte por parte, em vez de manter três configurações:

| Parte | Tela | O que vem da Sul |
| --- | --- | --- |
| Home | Home · Seções | seções, ordem, textos, imagens e o tema em uso |
| Menu | Navegação (e Coleções) | navegação e menu de coleções, no site e na barra da INK |
| Página do estado | Páginas de estado | seções ligadas, categorias, subcategorias e grades |
| Páginas | Páginas | as páginas publicadas da Sul passam a existir na região; uma página da região com o mesmo endereço vence a da Sul |

Na região (Norte ou Centro-Oeste), o cartão **Seguindo a Sul / Configuração própria** no topo de cada tela liga e desliga. É rascunho: vale depois de publicar a região. A configuração própria da região nunca é apagada: fica guardada e volta quando você escolhe "Usar configuração própria".

Depois disso, basta editar e publicar **na Sul**. A região passa a mostrar a versão publicada da Sul, adaptada:

- links da Sul (`/sul/...`) passam a apontar para a região; um link para um estado ou modelo de personalização que a região não tem sai (num bloco de grade, ele leva à home da região);
- as capas de estados ficam só com os estados da região;
- `{regiao}` em qualquer texto de seção ou página vira o nome da região ("Sul", "Norte", "Centro-Oeste");
- coleções são as mesmas da loja única: cada região já mostra só os produtos dela. Um produto de cidade de outra região some sozinho (um card de Curitiba na abertura não aparece no Norte), e uma vitrine sem produtos da região some inteira.

## Mudar só uma região

No editor de cada seção da Sul, **Aparece em** escolhe as regiões em que ela entra. Para trocar o conteúdo só no Norte, duplique a seção, deixe uma cópia em "Sul" e a outra em "Norte". A abertura e o rodapé aparecem sempre.

Para mudar uma parte inteira, use a configuração própria naquela parte (e, se quiser partir da Sul, **Copiar de outra região**, veja `copiar-regiao.md`).

## O que continua de cada região

Tracking, lançamento, aparência (paleta), cupons e promoções, pódio, modelos de personalização e a ordem de produtos que a própria região definiu numa coleção.

## Loja única

Seguir só vale enquanto as regiões vendem na mesma loja da INK que a Sul (`COMMERCE_MODE=single-store`). Se a loja única for desligada, cada região volta a mostrar a configuração própria, e o cartão avisa.

Código: `src/lib/site-config/follow.ts` (aplicado na leitura do publicado, em `published.ts`) e `follow-schema.ts`.
