# Ajustes antes da próxima etapa — Hero comercial + Recriações/redesenhos

Antes de gerar banners ou avançar para Norte/Centro-Oeste, faça estes dois ajustes de leitura editorial no `/sul`.

Não alterar arquitetura geral.
Não fazer commit.
Não fazer push.
INK continua read-only.

---

# 1. Hero: trocar DDD pelas famílias comercialmente mais fortes

Os três produtos protagonistas do hero NÃO devem ser DDD.

DDD continua sendo uma excelente camada de identidade regional, mas não é a principal vitrine comercial.

As famílias que devem liderar o hero são:

1. Ponto de Origem
2. Feito Em
3. Coordenadas

Preservar:

- headline atual;
- busca na primeira dobra;
- comportamento mobile-first;
- estrutura atual do hero.

Substituir apenas os três produtos protagonistas.

Preferência:

- usar um produto real de cada família;
- quando visualmente bom e disponível, distribuir entre SC, PR e RS;
- não forçar uma cidade/estado se isso piorar composição;
- documentar quais produtos reais foram escolhidos.

Nova hierarquia:

```text
BUSCA / CIDADE
↓
PONTO DE ORIGEM · FEITO EM · COORDENADAS
↓
DDD
↓
FALA DAQUI
↓
ESTADOS
↓
CIDADES
```

DDD permanece na seção editorial:

```text
O número de cada região
```

---

# 2. Recriações / releituras redesenhadas: auditar separadamente

Na análise anterior, produtos de arte/recriação parecem ter sido agrupados de forma ampla em:

```text
“Arte e expressão sem linha”
“paródias”
```

Isso é genérico demais.

Quero separar explicitamente:

```text
RECRIAÇÕES / RELEITURAS AUTORAIS REDESENHADAS
```

de:

```text
PARÓDIA FÁCIL / MEME / REFERÊNCIA POUCO AUTORAL
```

Não assumir que toda referência cultural tem alto risco de clichê.

---

# 3. Fazer inventário real das recriações

Auditar o catálogo real e identificar peças que:

- recriam uma obra, filme, série, capa, pôster ou referência visual;
- foram redesenhadas com elementos regionais;
- têm composição gráfica própria;
- não são apenas texto trocado;
- não dependem somente de um trocadilho.

Criar no relatório:

```text
docs/content/sul-recriations-audit.md
```

Para cada item:

```text
Nome do produto
ID INK
Slug
Imagem
Tema/referência
Cidade/estado/região relacionada
Tipo de releitura
Vendas, se disponível
Qualidade visual percebida
Risco de clichê
Potencial editorial
```

---

# 4. Classificar em 3 grupos

## A — Releitura forte

Critérios:

- arte realmente redesenhada;
- regionalismo integrado;
- bom impacto visual;
- pode funcionar mesmo sem explicar a referência;
- aparência de coleção autoral.

## B — Releitura média

- boa ideia;
- depende mais da referência original;
- pode funcionar em carrossel/coleção, mas não como grande manifesto.

## C — Paródia fácil

- basicamente troca de nome;
- piada/trocadilho como único valor;
- visual muito dependente da obra original;
- risco alto de deixar a marca com cara de souvenir/meme.

Não apagar nenhuma peça.
Isso serve apenas para decidir destaque editorial.

---

# 5. Propor onde as recriações entram na storefront

Não colocar automaticamente no hero.

Avaliar pelo menos estas possibilidades:

### Opção 1 — Seção editorial própria

```text
RECRIADO DAQUI
```

ou outro título melhor.

Carrossel horizontal com 4–6 artes fortes.

### Opção 2 — Coleção de destaque

Entrar depois de “Fala daqui”, como outra expressão cultural da região.

### Opção 3 — Bloco rotativo

Alternar campanhas de recriação em períodos específicos, sem virar seção fixa.

### Opção 4 — Página/coleção específica

Se houver volume e qualidade suficientes.

Comparar:

- impacto visual;
- coerência com a marca;
- risco de clichê;
- potencial de venda;
- manutenção.

---

# 6. Não misturar com as 8 famílias de cidade

As recriações não substituem:

- Ponto de Origem;
- Feito Em;
- Coordenadas;
- etc.

São uma camada editorial/comercial paralela.

A home precisa comunicar:

```text
CIDADE
+
ESTILO
+
CULTURA REGIONAL
```

e não só:

```text
CIDADE
+
8 MODELOS
```

---

# 7. Mobile-first também aqui

Se houver seção de recriações:

- usar carrossel/swipe;
- cards visuais;
- imagem maior que texto;
- no máximo 1–2 linhas de título;
- evitar descrições longas;
- permitir ver “mais da coleção”.

Não transformar em grid longa.

---

# 8. Relação com banners

As recriações podem gerar banners futuramente, mas NÃO incluir novos banners no inventário essencial ainda.

Primeiro auditar o catálogo.

Depois decidir se alguma releitura merece:

```text
collection banner
```

como prioridade IMPORTANTE ou FUTURO.

Não aumentar agora os 7 conceitos essenciais.

---

# 9. Retorno esperado

Retorne:

1. quais produtos passaram a compor o hero;
2. por que esses três foram escolhidos;
3. quantidade total de recriações/releituras encontradas;
4. quantas ficaram em A / B / C;
5. 10 melhores exemplos;
6. vendas desses exemplos, se disponíveis;
7. proposta de posição na home;
8. se vale criar uma seção fixa;
9. se alguma merece banner próprio;
10. confirmação de que nenhuma outra estrutura foi alterada;
11. confirmação de que não houve commit/push.

Depois disso, pare para revisão.
