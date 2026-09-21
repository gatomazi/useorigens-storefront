# GO — Plano V2 Regional do Sul antes da implementação

GO.

Antes de alterar qualquer código, crie o plano:

```text
docs/design/sul-v2-regional-plan.md
```

Não implemente a V2 ainda. Não altere layout, componentes, CSS, conteúdo, parser, indexer, resolver, commerce mapping, rotas ou integração INK nesta etapa.

O objetivo desta rodada é transformar a direção de regionalismo da Use Origens em um plano concreto e validável para o `/sul`.

## 1. Avalie cada bloco em dois eixos

Para cada seção atual do `/sul`, avalie separadamente:

```text
1. É premium?
2. Parece Sul?
```

Use tabela descritiva, sem nota numérica:

```text
| Bloco | É premium? | Parece Sul? | Problema atual | Direção V2 |
```

Inclua: Announcement, Header, Hero, Busca, Design Families, Estados, Mais vendidos, Editorial/muro de cidades, Made In/coleções, Footer, Página de cidade, Página de família/produto, Variante, Página de estado e Mobile.

## 2. Pergunta central

Aplique em cada bloco:

> Se eu remover a palavra “Sul”, ainda sobra algo que comunica a região?

Diferencie regionalismo real de regionalismo superficial.

Superficial:

```text
mapa + nome do estado + cor regional
```

Mais profundo:

```text
cidade + cotidiano + curadoria + linguagem + produto + contexto
```

## 3. Curadoria precisa de validação

Não trate agrupamentos como litoral/serra/interior como fatos aprovados.

Proponha hipóteses e marque claramente:

```text
PROPOSTA PARA VALIDAÇÃO
```

## 4. Use o catálogo real

Mapeie camadas editoriais reais além das 8 Design Families, quando existirem:

- Fala Daqui
- Do Nosso Jeito
- Da Nossa Terra
- Clube
- Pocket
- DDD
- Made In
- estaduais
- produtos de expressão
- outros grupos relevantes

Para cada uma, informe exemplos, volume aproximado se fácil obter, potencial de uso, onde poderia entrar na home e risco de virar clichê.

## 5. Reavaliar o muro de cidades

Crie pelo menos 3 alternativas conceituais:

### A — Geografia editorial
Ex.: “Do litoral à serra”, com grupos curados.

### B — Cidades em destaque
Poucas cidades por vez, com rotação editorial.

### C — Descoberta contínua
Cidade + microcontexto + busca.

Compare força regional, escalabilidade, risco de clichê, necessidade de curadoria manual e manutenção.

## 6. Estados com contexto

Proponha 2–3 tratamentos para RS, SC e PR que vão além de mapa + nome + número.

Pode usar cidade destaque, frase curta, coleção, produto, editorial ou fotografia futura.

Marque o que depende de asset.

## 7. Hero regional V2

Crie 3 direções de hero para o Sul.

Cada direção deve incluir:
- estrutura;
- tipo de imagem;
- headline;
- subtítulo;
- CTA;
- papel da busca;
- por que parece Sul;
- risco de ficar genérico.

Uma opção deve funcionar sem fotografia lifestyle nova, usando produto real + tipografia + curadoria. As outras podem assumir fotografia futura.

## 8. Busca como eixo

Defina posição ideal, relação com hero, desktop, mobile e como participa da narrativa:

```text
origem → cidade → identidade
```

## 9. Página de cidade

Proponha uma V2 que vá além de:

```text
nome + mapa + produtos
```

Pode incluir famílias, localidades, coleções relacionadas, editorial opcional, breadcrumb e descoberta de outras cidades.

Separe o que é automático do que é editorial/manual.

## 10. Briefing completo de fotografia

Crie:

```text
Plano de fotografia regional — Sul
```

Divida em:
- Lifestyle
- Cidade cotidiana
- Detalhe
- Produto em cena

Para cada tipo, definir objetivo, proporção, tamanho, orientação, posição do sujeito, espaço negativo, luz, cenário, roupa, poses e o que evitar.

## 11. Assets mínimos

Separar em:

```text
ESSENCIAL
IMPORTANTE
PODE ESPERAR
```

Não exija dezenas de assets para iniciar.

## 12. Tom de linguagem Sul

Defina o que usar, evitar, quanto regionalizar e onde regionalizar.

Regra:

```text
UX funcional = clara e neutra
editorial/campanha = pode carregar identidade regional
```

## 13. Evitar clichês

Crie:

```text
Regionalismo válido
vs
Regionalismo fácil/clichê
```

Símbolos regionais podem aparecer, mas não podem sustentar sozinhos a identidade.

## 14. Sistema regional futuro

Separe:

```text
BASE USE ORIGENS
```

de:

```text
CAMADA SUL
```

Crie tabela:

```text
| Elemento | Global Use Origens | Regional Sul |
```

Inclua tipografia, header, busca, grid, motion, cor, hero, copy, fotografia, cidades, coleções e editorial.

## 15. Dois bugs prioritários

Marcar no plano como:

```text
BUG — implementar junto da V2
```

1. Busca invisível em página de estado/404.
2. Botão de fechar invisível no menu mobile.

Não corrigir nesta fase.

## 16. Não desenhar Norte ou Centro agora

Pode mencionar reaproveitamento futuro, mas não criar curadoria, hero ou páginas dessas regiões.

## 17. Entrega esperada

Ao terminar `docs/design/sul-v2-regional-plan.md`, retorne:

1. resumo executivo;
2. 5 maiores falhas regionais atuais;
3. 5 maiores forças atuais;
4. 3 direções de hero;
5. alternativas para cidades;
6. alternativas para estados;
7. camadas editoriais reais encontradas;
8. pontos que exigem minha validação;
9. briefing de fotografia;
10. assets essenciais;
11. o que pode ser implementado sem novos assets;
12. o que deve esperar fotografia;
13. confirmação de que nenhum código foi alterado.

Depois disso, pare e aguarde aprovação.

Não implemente a V2 ainda.
Não faça commit.
Não faça push.
