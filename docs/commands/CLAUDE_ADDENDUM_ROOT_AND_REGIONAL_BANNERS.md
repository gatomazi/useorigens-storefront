# Addendum — Banners regionais + Storefront raiz `/`

Este addendum complementa a implementação V2 da Use Origens.

Ele NÃO substitui as decisões anteriores sobre:

- mobile-first;
- busca como eixo principal;
- regionalismo real;
- Sul como baseline;
- integração INK read-only;
- ausência de commit/push até revisão.

---

# 1. Banners passam a ser ferramenta principal de identidade regional

A partir desta fase, considerar que **banners/editoriais com fotografia e direção de arte regional serão a principal ferramenta visual para dar “cara de região” à storefront**.

A estrutura e os componentes continuam compartilhados.

A diferenciação emocional das regiões virá principalmente de:

- banners;
- fotografia;
- ambientação;
- copy editorial;
- cidades;
- produtos destacados;
- linguagem local;
- curadoria.

Não depender apenas de:

- paleta;
- mapa;
- nome da região;
- logo;
- DDD.

Esses elementos continuam úteis, mas os banners serão a camada visual mais forte.

---

# 2. Não bloquear a V2 atual por falta de banners

A implementação deve continuar funcionando sem assets novos.

Enquanto os banners definitivos não existirem:

- usar produto real;
- usar composição tipográfica;
- usar imagens existentes;
- criar slots com proporção e comportamento finais;
- evitar placeholders genéricos feios.

A UI deve ficar pronta para receber os banners depois sem refazer estrutura.

---

# 3. Criar um sistema de slots editoriais reutilizáveis

Definir componentes/slots claros para banners.

Exemplo conceitual:

```text
HeroBanner
RegionalEditorialBanner
StateBanner
CollectionBanner
CityEditorialBanner
CampaignBanner
```

Não precisa usar exatamente esses nomes.

O importante é haver tipos claros com:

- desktop asset;
- mobile asset;
- alt text;
- heading opcional;
- body opcional;
- CTA opcional;
- alignment;
- overlay;
- crop/focal point;
- região;
- destino.

---

# 4. Mobile e desktop precisam de assets próprios

Não assumir que o mesmo banner funciona em qualquer tela.

Para cada slot importante, prever:

```text
desktop landscape
mobile portrait
```

ou crop/focal point separado.

Como ~90% do tráfego é mobile, o asset mobile deve ser tratado como principal.

A especificação deve sempre começar pelo mobile.

---

# 5. Documento obrigatório de produção de banners

Ao final da implementação visual e antes de considerar a fase concluída, criar:

```text
docs/design/regional-banner-production-plan.md
```

Esse documento será usado para gerar os banners posteriormente diretamente no ChatGPT.

Ele precisa responder exatamente:

> Quantos banners precisamos criar para cada região e para a raiz?

---

# 6. Estrutura do documento de banners

Organizar por:

```text
ROOT / USE ORIGENS
SUL
NORTE
CENTRO-OESTE
```

Para cada uma, listar:

```text
Banner
Objetivo
Página/posição
Mobile/desktop
Dimensão recomendada
Aspect ratio
Conteúdo
Composição
Pessoa/produto
Espaço negativo
Copy sobreposta ou não
CTA
Focal point
Direção de luz
Cenário
O que evitar
Prioridade
Reutilizável?
```

---

# 7. Entregar contagem final

No início do documento, criar um resumo:

```text
ROOT
- X banners únicos
- Y arquivos finais considerando mobile + desktop

SUL
- X banners únicos
- Y arquivos finais

NORTE
- X banners únicos
- Y arquivos finais

CENTRO-OESTE
- X banners únicos
- Y arquivos finais

TOTAL
- X conceitos
- Y arquivos finais
```

Diferenciar:

```text
conceito/banner
```

de:

```text
arquivo final/crop
```

Exemplo:

```text
1 hero = 1 conceito
mas
hero desktop + hero mobile = 2 arquivos finais
```

---

# 8. Não inflar desnecessariamente a quantidade

Não quero dezenas de banners só porque existem muitos slots.

Priorizar o mínimo necessário para dar identidade forte.

Classificar:

```text
ESSENCIAL
IMPORTANTE
FUTURO
```

O documento deve dizer qual é o **mínimo de produção** para lançar cada região com boa percepção de marca.

---

# 9. Storefront raiz `/`

Não esquecer que:

```text
https://www.useorigens.com.br/
```

é uma storefront própria.

Ela NÃO é:

- `/sul`;
- redirect automático;
- tela neutra sem personalidade;
- página apenas com três links.

A raiz é a marca Use Origens.

---

# 10. Papel da raiz

A home `/` deve responder:

```text
O que é Use Origens?
+
De onde você é?
+
Qual região você quer explorar?
```

A busca global de cidade é um dos elementos principais.

---

# 11. Estrutura conceitual da raiz

Pensar em algo aproximadamente assim:

```text
HEADER USE ORIGENS

HERO MASTER
“QUAL É A SUA ORIGEM?”

[ BUSQUE SUA CIDADE ]

DIVISÓRIAS REGIONAIS

SUL
[ banner regional ]
[ explorar o Sul ]

NORTE
[ banner regional ]
[ explorar o Norte ]

CENTRO-OESTE
[ banner regional ]
[ explorar o Centro-Oeste ]

EDITORIAL DA MARCA

FOOTER
```

Não implementar exatamente assim se surgir composição melhor.

Mas a ideia de **divisórias claras de região** é obrigatória.

---

# 12. Divisórias regionais da raiz

Cada região precisa aparecer como uma “porta de entrada” visual.

Não usar apenas cards pequenos.

As divisórias devem ter presença.

Podem ser:

- banners full-width alternados;
- painéis grandes;
- scroll editorial;
- cards horizontais grandes;
- mosaico assimétrico.

Cada bloco regional deve transmitir imediatamente sua personalidade.

---

# 13. Busca global na raiz

Na rota `/`, a busca deve ser global.

Exemplo:

```text
Busque sua cidade...
```

Ao encontrar:

```text
Tijucas
Santa Catarina · Sul
```

deve levar para:

```text
/sul/sc/tijucas
```

Exemplo:

```text
Belém
Pará · Norte
```

leva para:

```text
/norte/pa/belem
```

Exemplo:

```text
Goiânia
Goiás · Centro-Oeste
```

leva para:

```text
/centro-oeste/go/goiania
```

Não duplicar lógica.

Usar o índice existente/expandido.

---

# 14. A raiz não deve favorecer visualmente uma região

A Use Origens precisa parecer marca-mãe.

Evitar usar a paleta do Sul como base dominante.

A raiz deve ter identidade neutra da marca e deixar cada bloco regional carregar seu próprio acento.

---

# 15. Relação visual raiz → região

A pessoa precisa perceber:

```text
Use Origens
↓
Sul
```

como mesma marca.

Mas `/sul` deve ter muito mais personalidade regional.

A raiz apresenta.

A região mergulha.

---

# 16. Banners da raiz

A raiz provavelmente precisará de:

- 1 hero master;
- 1 banner Sul;
- 1 banner Norte;
- 1 banner Centro-Oeste;
- 1 bloco editorial institucional opcional.

Validar no layout final.

Não assumir quantidade final antes do design.

O documento de produção deve fechar esse número.

---

# 17. Banners regionais

Cada região provavelmente terá, no mínimo:

- hero regional;
- bloco editorial/campanha;
- estados ou território;
- coleção regional;
- possível banner de cidade.

Mas novamente:

não fixar número final agora.

Primeiro desenhar o sistema.

Depois documentar a necessidade real.

---

# 18. Fotografias e geração futura via ChatGPT

Como os banners serão gerados depois via ChatGPT, o documento final deve ser suficientemente detalhado para virar prompt.

Para cada asset, escrever um mini-briefing reutilizável.

Exemplo:

```text
SUL — HERO MOBILE

Objetivo:
Apresentar identidade regional contemporânea.

Dimensão:
1440×1800 ou maior, 4:5.

Cena:
Pessoa adulta brasileira usando camiseta de cidade,
em rua urbana do Sul em dia nublado.

Composição:
Sujeito no terço inferior/direito.
Espaço negativo superior/esquerdo para headline.

Luz:
Natural difusa.

Evitar:
ponto turístico óbvio,
chimarrão,
bandeira,
roupa típica,
cara de banco de imagens.
```

---

# 19. Criar arquivo de prompts base

Além do plano de produção, criar:

```text
docs/design/banner-generation-prompts.md
```

Para cada banner essencial, gerar um prompt-base pronto para uso no ChatGPT.

Separar:

```text
ROOT
SUL
NORTE
CENTRO-OESTE
```

Não gerar imagens agora.

Apenas prompts.

---

# 20. Root architecture — preparar agora, implementar na hora certa

Mesmo que a implementação imediata esteja focada no Sul, a arquitetura de componentes deve considerar a raiz.

Não criar componente Sul-hardcoded que depois impeça `/`.

O sistema deve permitir:

```text
RootStorefront
RegionalStorefront
CityStorefront
Product/FamilyPage
```

ou equivalente.

Não precisa criar essas classes/componentes literalmente.

É uma regra de arquitetura.

---

# 21. Ordem futura de implementação

A sequência passa a ser:

```text
1. finalizar V2 Sul
2. validar visual e mobile
3. criar sistema regional compartilhado
4. implementar Norte
5. implementar Centro-Oeste
6. implementar raiz `/`
7. criar/gerar banners finais
8. inserir assets finais
9. SEO / analytics / redirects
```

Se for tecnicamente mais eficiente criar parte da raiz antes, documentar.

Mas não sacrificar a validação do Sul.

---

# 22. Documento final da fase

Ao final da fase visual/regional, entregar:

```text
docs/design/regional-banner-production-plan.md
docs/design/banner-generation-prompts.md
```

E também informar no retorno:

1. quantos banners únicos para a raiz;
2. quantos para Sul;
3. quantos para Norte;
4. quantos para Centro-Oeste;
5. quantos arquivos finais considerando mobile/desktop;
6. quais são essenciais;
7. quais podem esperar;
8. quais banners podem ser reutilizados;
9. quais precisam de produção regional única;
10. quais slots já estão preparados no código.

---

# 23. Critério de qualidade

Quando o usuário entrar em:

```text
/
```

deve sentir:

> “Aqui eu escolho minha origem.”

Quando entrar em:

```text
/sul
```

deve sentir:

> “Isso é daqui.”

E o mesmo deve funcionar no futuro para:

```text
/norte
/centro-oeste
```

A regionalização visual deve vir principalmente da soma de:

```text
banner
+
fotografia
+
cidade
+
curadoria
+
produto
+
linguagem
```

e não de trocar apenas cor, logo ou mapa.
