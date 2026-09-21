# Próximo passo — Correção do binding + início do vertical slice `/sul`

GO. Pode continuar agora, sem esperar nova confirmação e sem commit/push por enquanto.

A auditoria está boa e a direção geral está correta. Antes de iniciar o visual, porém, faça um ajuste arquitetural importante no ADR 0001 e no modelo do indexador.

## 1. Corrija o binding para suportar múltiplos produtos dentro da mesma Design Family

`(cityId, designFamily)` sozinho não é suficiente.

O próprio catálogo mostrou casos como:

- Origem
- Origem Localidade
- Origem Regional
- Origem Personalizado/Personalizada
- Origem Distrito
- Origem Legenda
- Origem Explicativa
- Coordenadas Personalizado
- Coordenadas Centro
- Território Desde
- Essencia

Portanto, não descarte nem sobrescreva essas variações.

Modele algo conceitualmente assim:

```ts
type CityDesignBinding = {
  cityId: string;
  designFamily: DesignFamily;

  designVariant: string; // normalized internal key
  variantLabel?: string;

  parentCityId?: string;
  localityLabel?: string;

  isPrimary: boolean;
  priority: number;

  commerceStoreKey: CommerceStoreKey;

  inkProductId: string;
  slug: string;
  storeProductUrl: string;
  imageUrl: string;
  price: number | null;

  syncedAt: string;
};
```

A chave única deve considerar pelo menos:

```text
(cityId, designFamily, designVariant, inkProductId)
```

ou uma estrutura equivalente que preserve todos os produtos reais.

A Design Family continua sendo o conceito principal da UI.

Ou seja: o cliente continua vendo algo simples como:

```text
Legado
Ponto de Origem
Coordenadas
Tipografia
Traço
Território
Feito Em
Gentílico
```

Mas uma família pode possuir mais de uma variação disponível.

---

## 2. Diferencie família principal de variações

Na página de cidade, não quero transformar novamente o catálogo em dezenas de produtos.

Exemplo:

```text
TIJUCAS

Ponto de Origem
Coordenadas
Tipografia
...
```

Cada família deve escolher deterministicamente um produto `primary` para representar o card.

Depois, se existirem variantes dentro daquela família, elas podem aparecer na experiência detalhada como:

```text
Ponto de Origem

Principal
Regional
Localidade
Distrito
...
```

somente quando realmente existirem.

Defina uma regra explícita e determinística de prioridade.

Por exemplo, dentro de Ponto de Origem:

```text
Origem base
> Regional
> Personalizado
> Localidade
> demais variantes
```

Mas valide os nomes reais antes de fechar essa ordem.

Não selecione o primeiro produto arbitrariamente baseado na ordem retornada pela API.

---

## 3. Localidade não é município

Casos como:

```text
Praia Paraíso | Origem Localidade RS
tag: Torres
```

devem continuar vinculados a:

```text
Torres → município
Praia Paraíso → localidade
```

Não crie uma City canônica chamada Praia Paraíso.

Modele:

```text
parentCityId = Torres
localityLabel = Praia Paraíso
```

Isso permitirá futuramente criar dentro da página de Torres algo editorialmente interessante como:

```text
Também de Torres

Praia Paraíso
...
```

sem contaminar a estrutura municipal/IBGE.

---

## 4. Nunca hard-code “8 estampas disponíveis”

Os 8 continuam sendo as Design Families conceituais do sistema, mas cobertura real é dinâmica.

Portanto, não escreva na UI:

```text
8 maneiras de vestir Tijucas
```

se a cidade só possuir 6.

Use a quantidade real:

```text
6 maneiras de vestir Tijucas
```

ou uma copy que não dependa de quantidade:

```text
Escolha como vestir Tijucas
```

A grade deve renderizar apenas famílias disponíveis.

---

## 5. Não consolide preços nem lojas agora

Mantenha neste momento:

```text
Sul → Use Sul
Norte → Use Norte
Centro-Oeste → Use Centro
```

`COMMERCE_STORE_PRIORITY` deve respeitar a loja regional atual.

Ainda não estamos consolidando Norte/Centro dentro da Sul.

A arquitetura apenas deve estar pronta para, no futuro:

```text
Sul
Norte
Centro-Oeste
→ loja.useorigens.com.br
```

ser uma mudança de configuração/indexação.

O preço exibido continua vindo integralmente da INK correspondente.

Não normalize:

```text
109,90
99,90
94,90
```

e não tome decisão de preço dentro do storefront.

Essa mudança será tratada como decisão de negócio quando fizermos a consolidação real.

---

## 6. Feche os dois itens técnicos ainda abertos

Antes de considerar o indexador estável:

- confirme através dos dados reais o padrão de slug de `Feito em` na Sul e como extrair UF de forma segura;
- confirme o(s) host(s) real(is) de imagem utilizados pela INK e configure `next/image`.

Se o produto não puder ser reconciliado com segurança:

```text
log
+
exclude from city resolver
```

Nunca adivinhe cidade ou UF.

Atualize o ADR 0001 com essas decisões.

---

# Depois disso, avance imediatamente para o visual foundation + `/sul`

Não bloqueie o desenvolvimento pela falta de uma logo enorme ou de novas fotografias de campanha.

Antes, faça uma varredura completa no workspace atrás dos assets já existentes.

Se não houver fotografia de campanha adequada:

- use produtos reais retornados pela INK;
- composição editorial;
- tipografia forte;
- whitespace;
- recortes de produto;
- fundos/texturas coerentes com a marca;
- estrutura visual de alto nível.

Não use imagens placeholder genéricas.

Também não invente ou redesenhe uma nova logo da Use Origens apenas porque o arquivo atual é pequeno. Use o asset existente em tamanho apropriado e construa a composição para não depender de uma logo gigante.

Fotografia lifestyle/campanha pode ser substituída posteriormente sem alterar a arquitetura do layout.

---

# `/sul` agora é a prioridade absoluta

Quero a primeira versão contendo:

```text
/sul

Announcement
Header
Hero premium
Busca de cidade
Estados RS / SC / PR
Design Families
Produtos/destaques reais
Carrossel
Bloco editorial
Footer
```

Visualmente, trate isso como storefront de marca de vestuário, não como aplicação web.

Use as skills definidas anteriormente, principalmente:

- Frontend Design;
- web-design-guidelines;
- vercel-react-best-practices;
- shadcn apenas como primitives;
- Motion quando agregar;
- Embla para carrosséis.

Não quero aparência default do shadcn.

---

# Hero

Quero algo que consiga funcionar mesmo antes de termos novas fotos de campanha.

Pode explorar direção como:

```text
VISTA DE ONDE VOCÊ É.

Identidade que começa no lugar
que você chama de seu.

[ ENCONTRAR MINHA CIDADE ]
```

Isso é apenas direção de conteúdo, não obrigação de copy final.

O hero precisa ter presença visual real.

Pode combinar:

- tipografia editorial grande;
- composição com camiseta/produto real;
- background sutil;
- elementos gráficos da identidade;
- movimento discreto.

Evite colocar texto demais.

---

# Busca de cidade

Faça dela um dos principais elementos da experiência.

Desktop e mobile devem estar muito bons.

Resultado:

```text
Tijucas
Santa Catarina · Sul

Florianópolis
Santa Catarina · Sul
```

Precisa suportar aliases, acentos e teclado.

Selecionando uma cidade:

```text
/sul/sc/tijucas
```

---

# Primeira cidade ponta a ponta

Escolha uma cidade real com boa cobertura, preferencialmente uma que permita testar várias famílias.

Implemente:

```text
/sul
↓
buscar cidade
↓
/sul/sc/{cidade}
↓
famílias disponíveis
↓
preview real vindo da INK
↓
família
↓
produto resolvido
↓
imagem real
↓
preço real
↓
CTA
↓
storeProductUrl real da INK
```

Nada mockado nessa parte crítica.

---

# Página da cidade

Quero que ela seja muito visual.

Algo conceitualmente como:

```text
TIJUCAS
Santa Catarina · Sul

[ editorial ]

Escolha como vestir Tijucas

[ Ponto de Origem ]
[ Coordenadas ]
[ Tipografia ]
[ Traço ]
...
```

Use apenas as famílias realmente disponíveis.

Se uma família tiver variantes:

```text
Ponto de Origem
```

continua sendo um único card principal.

As variações aparecem depois, não na grade principal.

---

# Visual QA obrigatório

Quando tiver o primeiro vertical slice:

abra/renderize em pelo menos:

```text
375
430
768
1280
1440
```

Faça screenshots.

Analise criticamente:

- hero;
- crop das imagens;
- hierarquia;
- espaçamento;
- densidade;
- tipografia;
- mobile;
- carrosséis;
- hover;
- transições;
- loading;
- busca;
- sensação geral de marca.

Depois faça uma segunda rodada de refinamento antes de me apresentar.

Não considere “funciona” como suficiente.

O critério é:

> eu conseguir olhar `/sul` e enxergar uma candidata real à nova storefront da Use Origens.

Continue agora.

Quando terminar esse milestone, me retorne:

1. resumo do que foi implementado;
2. arquivos principais alterados/criados;
3. arquitetura final do adapter/indexer/resolver;
4. mudanças feitas no ADR;
5. screenshots desktop/mobile;
6. fluxo real utilizado para a cidade de teste;
7. produto(s) INK usados no teste;
8. pendências técnicas;
9. pontos visuais que você ainda acredita que precisam de assets melhores;
10. resultado dos testes/lint/build.

Não faça commit nem push até eu revisar.
