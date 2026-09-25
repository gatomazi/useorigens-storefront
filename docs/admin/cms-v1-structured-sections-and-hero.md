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
