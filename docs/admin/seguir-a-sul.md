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

## Quando a região ainda não tem a coleção

Uma seção da Sul que depende de uma coleção que a região ainda não tem **sai sozinha** da região, sem ficar quebrada:

- **campanha** cujo botão leva a uma coleção com menos de 3 produtos da região (ex.: "Você conhece a referência", que leva a Do Nosso Jeito), ou a
  um modelo de personalização ou página que a região não tem: a seção inteira sai (sem o botão, ela seria um beco sem saída);
- **vitrine** sem nenhum produto da região: sai;
- **bloco da grade** que leva a essa coleção: só o bloco sai.

Quando a região passa a ter os produtos **na mesma coleção da INK** (ex.: releituras do Norte entrando em Do Nosso Jeito), a seção volta sozinha,
sem mexer no painel. Uma grade com menos blocos do que colunas se ajusta aos blocos que tem (2 blocos = 2 colunas), sem deixar buraco. Na lista **Imagens e produtos do Norte**, cada seção fora da região aparece com o aviso **Fora do Norte** e o motivo.

## Imagens e produtos de cada região

A ideia é seguir a **estrutura** da Sul: cada região mantém os produtos e os banners dela. Na região que segue a home, a tela Home mostra
**Imagens e produtos do Norte** (ou do Centro-Oeste): a lista das seções da Sul publicada, cada uma com **Editar**. Ali dá para trocar:

- a foto da seção (celular e desktop, com o foco);
- na abertura, os produtos em destaque e o banner de cada um;
- a capa de cada estado;
- os blocos de uma grade de imagens (imagem, texto e link) e o número de colunas (ex.: 2 colunas para os 2 blocos que a região tem).

**Vale por tema:** cada tema da home da Sul (Original, Editorial, Black Friday, Natal) tem as próprias imagens e produtos da região. As fotos do
dia a dia do Norte não cobrem a abertura de Natal da Sul: quando a Sul troca de tema, a lista passa a ser a do tema novo, e o que não for trocado
nele mostra o da Sul.

Só o que for trocado fica guardado na região. O resto continua seguindo a Sul, e uma mudança na Sul passa a valer lá também. **Voltar a usar as
imagens e os produtos da Sul** desfaz a troca daquela seção. Textos, ordem, layout e as coleções das vitrines vêm sempre da Sul (cada região já
mostra só os produtos dela em cada coleção).

## Mudar só uma região

No editor de cada seção da Sul, **Aparece em** escolhe as regiões em que ela entra. Para trocar o conteúdo só no Norte, duplique a seção, deixe uma cópia em "Sul" e a outra em "Norte". A abertura e o rodapé aparecem sempre.

Para mudar uma parte inteira, use a configuração própria naquela parte (e, se quiser partir da Sul, **Copiar de outra região**, veja `copiar-regiao.md`).

## O que continua de cada região

Tracking, lançamento, cupons e promoções, pódio, modelos de personalização e a ordem de produtos de cada coleção. As cores também são da região,
em qualquer tema: quando a home da Sul está em Editorial, Black Friday ou Natal, vêm as seções e o jeito do tema (faixa do topo e rodapé na cor
principal), mas pintados com a paleta da região. Se a região tem cores próprias guardadas para aquele tema (Aparência → tema → cores), valem
essas; senão, as que ela usa hoje. Cores escritas dentro de uma seção (o fundo vermelho da abertura de Natal, por exemplo) fazem parte da seção
e vêm da Sul; as que usam a cor da região mudam junto.

## Loja única

Seguir só vale enquanto as regiões vendem na mesma loja da INK que a Sul (`COMMERCE_MODE=single-store`). Se a loja única for desligada, cada região volta a mostrar a configuração própria, e o cartão avisa.

Código: `src/lib/site-config/follow.ts` (aplicado na leitura do publicado, em `published.ts`) e `follow-schema.ts`.
