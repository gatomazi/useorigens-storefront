# CMS: seções estruturadas nas três regiões e produtos do hero

Duas entregas locais (nada foi enviado, publicado ou deployado; nenhuma home publicada foi alterada).

## 1. Estilos da cidade, Escolha seu estado e Campanha regional (`a94ca4b`)

Home · Seções → **Adicionar seção** agora tem dois grupos: **Produtos** (coleção da INK, com autocompletar e Biblioteca como antes) e **Componentes da home** (cards com nome, finalidade, mini-esquema e o estado real dos dados da região selecionada).

| Modelo | O que é | Regras |
|---|---|---|
| Estilos da cidade | `city-styles`: os estilos reais da cidade de exemplo da região | Uma por região (existindo, o card oferece **Ir para a seção**). Título padrão neutro fora do Sul ("Sua cidade, do seu jeito."); "8 jeitos" só no Sul. Campos: título, subtítulo (`{city}`), quantidade (1 a 8), fundo (cor, degradê, imagem, véu, foco). Só entram produtos da loja INK da própria região; o painel mostra quantos dos 8 estilos existem de verdade e avisa se o título promete 8 sem haver 8. Sem dados, a seção é omitida na loja. |
| Escolha seu estado | `states` com os estados da região (Sul RS/SC/PR, Norte, Centro-Oeste) | Uma por região. Título, subtítulo, fundo. Estados sem cidade com produto real são omitidos (nunca link para página vazia) e listados como pendência no editor. |
| Campanha regional | `campaign` | Várias permitidas, ids únicos. Texto inicial neutro com o nome da região (nada do Sul, sem oferta/contagem). Botão opcional: busca de cidade (padrão), página **da própria região** ou URL da loja Use; um caminho de outra região é recusado pelo validador. Fundo por cor/degradê/imagem, sem faixa avulsa. |

- Tudo é `jsonb` no documento existente: campo opcional novo `count`; sem migração; documentos antigos continuam válidos. As dez seções do Sul e o markup padrão dos três componentes são idênticos (equivalência pixel a pixel a 375 e 1280 px).
- Novas seções só entram no **rascunho** da região selecionada; ordenar, ocultar, editar, remover (as criadas aqui), restaurar e publicar usam o fluxo existente.
- O `update` de seção passou a validar também as regras do documento inteiro (loja da região, rota da região), reportando só o que é daquela seção.

### Grade de imagens (`image-grid`, `feature/secao-grid-imagens`)

Quarto modelo em **Componentes da home** e em **Componentes** das páginas: blocos com imagem e nome, cada um levando a um destino próprio ("Compre por peça", "Coleções", subtemas de uma categoria-pai).

- **Blocos** (`tiles`, de 2 a 12, na ordem da lista): nome (até 40), legenda opcional (até 80), imagem opcional da Mídia e destino. Os destinos são os mesmos de um botão (coleção pública da INK, hotpage/categoria publicada, caminho da própria região, seção da página, URL da loja Use) e passam pelas mesmas regras: loja e rotas só da região, página precisa estar publicada, coleção interna é recusada na publicação. Nada vem do catálogo, então um bloco nunca mostra preço ou contagem que possa ficar errado.
- **Layout** (`grid`): colunas no desktop (2, 3 ou 4; no celular sempre 2), formato das imagens (retrato 4:5, quadrado, paisagem 4:3) e nome embaixo da imagem ou sobre ela (texto branco com degradê escuro).
- **Sem imagem**, o bloco vira uma placa na cor da região com uma seta (serve para um "Ver tudo"). As imagens dos blocos são decorativas: o nome é o texto do link.
- **Ao adicionar**: "Compre por peça" com dois blocos que existem em toda região (Camisetas → busca de estampas; Canecas e ecobags → Outros artigos), antes da campanha de fechamento. Pode haver várias grades.
- Erros de preenchimento aparecem em português no editor ("Bloco 2: escolha para onde ele leva."). Um bloco cujo destino não resolve na loja é omitido (nunca link morto); sem blocos, a seção some.

### Produtos em grade (`layout.display`, `feature/grade-produtos-fundo-pagina`)

Toda seção de produtos (coleção da INK, Uma Penca ou curadoria editorial), na home e nas páginas, escolhe a **Exibição** em Layout: **Carrossel** (a fileira de sempre) ou **Grade** (todos os cards na página, como numa categoria: 4 por linha no desktop, 3 no tablet, 2 no celular).

- `layout.display: "grid"`; ausente = carrossel. Nada é gravado para o carrossel, então as seções salvas antes continuam idênticas.
- Limite de cards: 3 a 24 no carrossel, 3 a **48** na grade (tudo o que a coleção guarda para vitrine, `MAX_STORED_MEMBERS`). Voltar de grade para carrossel corta o limite para 24 no salvar.
- Mesmo card, mesmo título/"Ver todos" e mesmo evento de clique (`GoToInk` / `GoToPenca` com o `source_section` da seção) nos dois modos. O primeiro card personalizável continua sendo a primeira célula. Na grade, a partir de 8 cards o "Ver todos" se repete como botão no fim.
- A ordem manual e os produtos escondidos da coleção valem igual nos dois modos.
- **Adicionar seção** (home e páginas) já pergunta a exibição ao criar; a lista de seções mostra "Grade de produtos".

### Botão "Comprar" nos cards (`layout.buyLabel`, `feature/botao-comprar-cards`)

Em Layout, toda seção de produtos (carrossel ou grade, home e páginas) pode ligar **Botão “Comprar” em cada card de produto**, com o texto editável (até 20 caracteres; vazio vira "Comprar").

- `layout.buyLabel`; ausente = sem botão (seções existentes não mudam).
- O botão é parte do próprio link do card (não é um segundo link): abre a mesma página do produto na INK ou na Uma Penca e dispara o mesmo `GoToInk`/`GoToPenca`, uma vez.
- Fica no pé do card, alinhado em toda a linha mesmo quando os nomes quebram em duas linhas. Segue o tom da seção: preto em fundo claro, branco em fundo escuro (inclusive na página com fundo escuro próprio).
- O primeiro card personalizável, quando existe, mostra o texto do botão dele ("Personalizar") no mesmo formato.
- A lista de seções mostra o selo "Botão “Comprar”". Capturas: [`screenshots/botao-comprar-cards/`](../screenshots/botao-comprar-cards/).

## Fundo da página (`page.backdrop`, `feature/grade-produtos-fundo-pagina`)

Hotpages e categorias-pai têm o card **Fundo da página** (página temática: Black Friday, Natal…): cor da página inteira, cor do texto e, opcional, uma imagem de **pattern** repetida por cima (tamanho de cada repetição 40–600 px, intensidade 5–100%). Só a página muda; a home e o resto da loja não.

- `backdrop: { color, tone: "light" | "dark", pattern?: { image, size, opacity } }`; sem `backdrop`, o fundo normal da região. A imagem é sempre decorativa, entra na tabela de mídia da publicação e, se faltar, a página aparece só com a cor.
- O pattern é uma camada sob as seções. Seção com fundo próprio (foto, cor, papel) continua pintando o dela.
- **Texto**: com fundo escuro (`tone: "dark"`), o texto das seções sem fundo próprio fica claro (`.page-dark` em `globals.css`, que troca só a cor do texto e os tons `--ink-soft`/`--ink-mute`/`--line`; `--ink` fica como está porque também pinta botões e etiquetas). Seções de produtos e o topo da página sem fundo próprio seguem o tom da página automaticamente. Seção com superfície clara própria volta ao texto escuro (`.on-light`), e as duas seções sem versão escura (Estilos da cidade, Escolha seu estado) ficam sobre papel.
- Legibilidade: o contraste do texto sobre a cor bloqueia a publicação abaixo de 3:1 e avisa abaixo de 4,5:1 (mesma regra das seções); pattern com intensidade acima de 50% só avisa. Ao trocar a cor, o editor sugere a cor de texto que lê melhor.

## 2. Três produtos do hero por região (`feature/cms-hero-featured-products`)

Home → Seções → **Hero** → bloco **Produtos em destaque**: três posições, buscar (cidade, UF, estilo ou ID) → **Usar aqui**, **Substituir**, **Limpar**, **↑/↓**. Cada ação salva o rascunho e atualiza a prévia 375/desktop; nada é publicado.

- **Referência**: `featured: [{ store, productId }]` na seção `hero` (máx. 3, sem duplicata; a loja precisa ser a da região). Foto, preço e link vêm do **snapshot do catálogo** na hora de renderizar; nada é copiado para o documento e a INK nunca é consultada.
- **Elegível**: produto de estilo de cidade (não localidade) presente no snapshot da **própria** loja, de cidade da região com página, com foto e link de compra verificado. Outro caso é rejeitado na escolha; se ficar inelegível depois de uma ressincronização, só aquele card é omitido na loja, a referência fica no rascunho e o painel avisa para substituir.
- **Sul**: sem `featured`, continua exatamente com os três cards de sempre (Porto Alegre · Ponto de Origem, Curitiba · Feito em, Joinville · Coordenadas), somente leitura, com **Personalizar a partir destes três** (converte em referências reais) e **Voltar aos três cards originais**. Norte e Centro-Oeste sem `featured` não mostram card algum (nunca os do Sul).
- **Vitrine**: com 3 cards, a apresentação aprovada do Sul; com 1 ou 2, a grade se ajusta (sem coluna vazia); com 0, o texto ocupa mais largura.
- Sem produtos elegíveis no ambiente, o painel diz o motivo e o resto do hero (texto, imagem) continua editável.

### Lacunas reais dos catálogos (dados locais desta máquina)
- Só entram **estilos de cidade** (Ponto de Origem, Feito em, Coordenadas, Legado, Território, Tipografia, Traço, Gentílico). Produtos avulsos (merch, dizeres) não são selecionáveis no hero porque o card mostra família + cidade/UF.
- Norte e Centro-Oeste locais têm milhares de produtos elegíveis (3.583 e 3.722), mas isso vem do catálogo sincronizado nesta máquina. **Em produção, Norte e Centro-Oeste só terão o que a sincronização (botão em Coleções) trouxer.**
- Nem toda cidade tem os oito estilos (Belém, por exemplo, tem menos); por isso o número de "Estilos da cidade" é sempre o que existe de verdade para a cidade de exemplo da região (Belém no Norte).

## Testes
- Vitest 556/556 (novos: `structured-sections`, `hero-featured` com snapshot fixture: elegibilidade, rejeição de outra loja, busca limitada, referências do Sul, schema).
- E2E do admin: `structured.spec.ts` (Norte, Centro-Oeste e Sul: adicionar, editar, prévia 375/desktop, publicar no sandbox, sem duplicar) e `hero.spec.ts` (três produtos reais no Norte, prévia, recusa de outra loja, reordenar/limpar, rascunho persistente, publicar, restaurar, Centro-Oeste independente e Sul byte a byte igual).
- Smoke público (`SMOKE_REGIONS_ONLY=1`): as regiões lançadas com os três componentes e o hero de 2 cards (Norte) e sem cards (Centro-Oeste). `verify-home-equivalence` do Sul: pixel-identical.
- Capturas do hero: [`screenshots/2026-09-25-cms-sections/`](../screenshots/2026-09-25-cms-sections/).
- Capturas da grade e do fundo (pattern de teste gerado só para a QA): [`screenshots/grade-produtos-fundo-pagina/`](../screenshots/grade-produtos-fundo-pagina/).
