# Gate final do `/sul` V2 — revisão visual, verdade geográfica e conteúdo

A V2 funcional está aprovada como baseline técnico.

Antes de iniciar `/norte`, `/centro-oeste`, `/` ou fazer commit/push, faça esta rodada final curta.

Não ampliar escopo.
Não alterar parser/resolver/commerce/INK.
Não gerar banners.
INK continua somente leitura.

## 1. Corrigir a nomenclatura geográfica

Hoje a UI/plano usa mesorregiões e em alguns pontos chama isso de “Regiões oficiais do IBGE”.

Isso não deve ir ao público dessa forma.

O IBGE substituiu as antigas Mesorregiões/Microrregiões pela divisão de 2017 em:

- Regiões Geográficas Intermediárias;
- Regiões Geográficas Imediatas.

Faça um audit da fonte geográfica atual.

### Preferência

Se for simples e seguro, migrar o microcontexto público para a divisão atual de 2017, usando fonte oficial do IBGE e mapeamento determinístico por município.

### Se a migração exigir risco/escopo grande agora

Não bloquear a V2.

Trocar apenas o rótulo público por algo neutro e verdadeiro, como:

```text
Região
```

ou:

```text
Região do estado
```

e documentar que o agrupamento interno atual usa a classificação histórica de mesorregiões.

Nunca chamar mesorregiões atuais de “regiões oficiais do IBGE”.

Criar/atualizar ADR se a decisão estrutural mudar.

---

## 2. Pacote visual para revisão humana

Não redesenhar nada nesta etapa.

Usar as screenshots já existentes em:

```text
docs/design/screenshots/sul-v2/
```

e produzir dois compilados de alta legibilidade:

```text
docs/design/screenshots/sul-v2-review-mobile.png
docs/design/screenshots/sul-v2-review-desktop.png
```

### Mobile board

Incluir, nesta ordem:

1. `/sul` — primeira dobra 375;
2. `/sul` — full page 375;
3. busca aberta/resultados 375;
4. menu aberto 375;
5. estado 375;
6. cidade 375;
7. PDP 375;
8. variante 375.

### Desktop board

Incluir:

1. `/sul` — primeira dobra 1440;
2. `/sul` — full page 1440;
3. estado 1440;
4. cidade 1440;
5. PDP 1440;
6. variante 1440.

Adicionar rótulo discreto sobre cada captura apenas no contact sheet, não no site.

Não reduzir as capturas a ponto de impossibilitar avaliação de tipografia e spacing.

---

## 3. Comparação V1 × V2

Criar um terceiro board:

```text
docs/design/screenshots/sul-v2-before-after.png
```

Comparar lado a lado:

```text
HOME MOBILE
V1 | V2

HOME DESKTOP
V1 | V2

CIDADE MOBILE
V1 | V2

PDP MOBILE
V1 | V2
```

Não fazer nova alteração durante essa comparação.

---

## 4. Validação editorial das 11 cidades

Criar:

```text
docs/content/sul-editorial-validation.md
```

Listar cada item real utilizado em:

```text
Fala de <cidade>
Cidades para começar
```

Para cada item:

```text
Cidade
UF
Tipo: expressão | padroeiro
Texto/nome exato do produto
ID INK
Slug/URL
Onde aparece na storefront
Observação de ambiguidade, se houver
Status: PENDENTE DE VALIDAÇÃO
```

Não interpretar a expressão.

Não explicar significado sem fonte.

Casos homônimos devem ficar destacados.

---

## 5. Hero e busca — registrar sem mudar

Criar uma seção no mesmo documento de validação com:

### Hero atual

```text
De qual Sul você é?
```

e sua copy auxiliar exata.

### Busca vazia

Registrar exatamente o que aparece:

- antes de digitar;
- com resultado;
- sem resultado.

Não reescrever nesta rodada.

Quero avaliar esse conteúdo visualmente primeiro.

---

## 6. Banners — congelar inventário

Não gerar nem alterar os prompts nesta rodada.

Considerar como baseline:

```text
ESSENCIAL = 7 conceitos / 14 arquivos
```

e para o Sul:

```text
S1 Hero
S2 Campanha
= 2 conceitos / 4 arquivos
```

Não produzir os 31 conceitos completos agora.

Depois da revisão visual, os primeiros banners a produzir serão S1 e S2.

A raiz R1 entra quando o layout `/` existir ou quando decidirmos validar a linguagem visual master.

---

## 7. Assets — não inventar

Nenhuma fotografia nova nesta rodada.

Não baixar imagem externa.
Não usar fotografia de benchmark.
Não gerar placeholder de IA.

---

## 8. Performance

Não perseguir agora o LCP simulado de Slow 4G com refatorações especulativas.

Registrar como dívida:

```text
Cidade: 2,9 s
PDP: 3,5 s
Slow 4G + CPU 4×
```

Como Fast 4G está ≤2,2 s e os LCP observados são menores, só fazer mudança se houver causa concreta identificada.

Não otimizar às cegas.

---

## 9. Teste de aparelho real

Criar:

```text
docs/qa/mobile-real-device-checklist.md
```

Checklist curto para execução manual posterior em aparelho real:

- abrir `/sul`;
- abrir menu;
- fechar menu;
- tocar busca;
- abrir teclado;
- digitar cidade;
- selecionar resultado;
- voltar;
- swipe em DDD;
- swipe em estados;
- abrir cidade;
- abrir família;
- trocar variante;
- tocar CTA INK;
- voltar do navegador;
- observar safe areas;
- observar zoom/foco;
- testar 4G real quando possível.

Não alegar que isso foi testado se não houver aparelho real disponível.

---

## 10. Não fazer

Não iniciar:

```text
/norte
/centro-oeste
/
```

Não fazer commit.
Não fazer push.
Não gerar banners.
Não mexer em preços.
Não escrever na INK.

---

## 11. Retorno esperado

Retorne apenas:

1. decisão tomada sobre mesorregiões vs divisão IBGE 2017;
2. arquivos alterados;
3. caminho do review mobile;
4. caminho do review desktop;
5. caminho do before/after;
6. caminho de `sul-editorial-validation.md`;
7. caminho do checklist de aparelho real;
8. número de itens editoriais pendentes;
9. confirmação de que banners não foram gerados;
10. confirmação de que nenhum commit/push foi feito.

Depois disso, pare.

A próxima decisão será visual/humana: aprovar a V2 e então produzir S1/S2 ou pedir ajustes.
