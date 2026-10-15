# Meu Pequeno Mundo — guia curto de curadoria

Os perfis ficam em `data/mundo/perfis-cidades.json`. A loja, o protótipo avulso e o pacote leem esse mesmo arquivo; não existe outra lista
de perfis. O catálogo de lugares (2.144 cidades e Regiões Administrativas do DF, com produtos reais) **não** passa por aqui: ele vem do
snapshot da loja, por `src/lib/mundo/catalogo.ts`. Um lugar sem perfil continua funcionando, com cenário regional e o ponto do IBGE.

A página não baixa o arquivo inteiro: cada perfil sai sozinho, só com as fontes que cita (`/api/mundo/perfis/<id>.json` na loja,
`contexto/perfis/<id>.json` no protótipo, gerados por `src/lib/mundo/perfis.ts`), e só para os lugares que entram no mundo. Por isso
o número de perfis não pesa no carregamento.

## Adicionar ou mudar um perfil

1. Copie o bloco de `data/mundo/modelo-perfil.json` para `cidades`, com a chave igual ao ID do IBGE (ou `df-ra:<região>` no DF).
2. Preencha identidade, conteúdo, geografia, visual e revisão. Copie a sede de `data/mundo/sedes-municipais-ibge-2022.json`. População e
   área vêm do Censo 2022 (SIDRA 4714); regiões, da API de Localidades do IBGE.
3. Cadastre cada fonte em `fontes`, com título, publicador, URL https, referência temporal (data da notícia, "sem data", registro)
   e a data em que foi consultada.
4. Rode `npm run mundo:validar`. Corrija todo `FAIL`. Leia os `WARN`.
5. Gere o protótipo e o pacote, se precisar mostrar fora da loja: `npm run mundo:dados && npm run mundo:prototipo && npm run mundo:pacote`.

## Regras de texto

- **Só fato com fonte.** Cada frase do resumo, cada referência e cada curiosidade apontam para pelo menos uma fonte em `fontes`.
  Fonte primária: IBGE, prefeitura, governo do estado, Iphan e institutos estaduais de patrimônio, universidades, sites oficiais do bem.
  Agregadores, blogs e resumos de busca não servem.
- **Datas administrativas separadas.** Fundação, distrito, vila, município, instalação, cidade e capital são marcos diferentes.
  Escreva como o IBGE separa ("vila em 1693, cidade em 1842") e não chame uma data administrativa de fundação.
- **Hipóteses de nome são atribuídas.** Use "Segundo a Prefeitura, em texto reproduzido pelo IBGE, o nome viria de…". Nunca como fato.
- **Sem promessa.** Não prometa avistamento, festa, horário, reabertura ou obra concluída. Prefira "é possível" e a data da fonte.
- **Divergências não são escolhidas.** Se as fontes divergem (área, data, número de ilhas), use o que é comum, atribua o número ou
  deixe de fora. Registre a divergência em `revisao.observacao`.
- **Sem superlativo de terceiros.** "Único no mundo", "o maior" e parecidos ficam de fora, mesmo quando a fonte oficial diz.
- **Tamanhos.** Frase até 160 caracteres. Resumo de 3 a 5 frases, até 600 caracteres. Texto de referência até 420 e `curto` até 200
  (o `curto` vai no balão do marco). Curiosidade até 400. O validador recusa o que a experiência cortaria.

## Regras de cenário

- O cenário é **ilustrativo**: todo marco tem uma `nota` dizendo que a forma é simplificada e o que é ilustrativo (cores, proporções,
  número de torres). Nunca reproduzir obra autoral; use uma figura genérica.
- O ambiente vem das fontes (relevo, água, vegetação, construções). Uma capital da região Norte não vira floresta por padrão, e uma do
  Centro-Oeste não vira cenário rural: Belém e Manaus são cidades de beira-rio; Goiânia e Campo Grande são urbanas, no Cerrado.
- No máximo **2 marcos interativos** por perfil. Cada marco aponta para uma referência cuja `descoberta.modulo` é o mesmo módulo.
- Não estimar coordenadas. Lugar sem ponto oficial (como Arapoanga e Água Quente, no DF) fica sem distância.

## Módulos que a cena conhece

| Grupo | Módulos |
|---|---|
| relevo | `vale-montes` (com `altura`), `planicie`, `costa-dunas` |
| água | `rio`, `rio-largo`, `vereda`, `mar`, `costa`, `lagoas`, `lagoas-muitas`, `lago` (`largura` e `direcao` opcionais) |
| vegetação | `redonda`, `araucaria`, `palmeira`, `buriti`, `mata`, `cerrado`, `arbusto`, `capim`, `junco`, `restinga`, `ipe` |
| construções | `colonial`, `urbano` (com `predios`), `acoriano` |
| marcos específicos | `santuario`, `pico-cruz` (pede `vale-montes`), `dunas` (pede `costa-dunas`), `baleia` (pede `mar`), `estufa`, `teatro-cupula`, `encontro-aguas` (pede rio) — formas pensadas para uma cidade; evite em outras |
| marcos genéricos | `igreja` (uma torre), `catedral` (duas torres), `ruinas`, `palacio`, `teatro-frontao`, `casarao`, `sobrado`, `mercado`, `mercado-ferro` (fica perto da água), `usina` (fica perto da água), `estacao`, `torre-relogio`, `coreto`, `monumento` (obelisco genérico), `mirante`, `forte`, `farol` (pede `mar` ou `costa`), `trapiche` (pede água), `ponte-urbana` (pede rio), `ponte-pensil` (pede rio, `mar` ou `costa`), `cachoeira`, `vinhedo`, `lago-mureta`, `lago-ilha` |
| bases (paleta e relevo de partida) | `litoral`, `serra`, `campos`, `vale`, `interior`, `amazonia`, `cerrado`, `alagado` |

A lista oficial é `MODULOS` em `src/components/mundo/experiencia/config.js`. A cena ignora qualquer nome fora dela, e o validador acusa.
Um marco novo pede código: a forma em `CONSTRUTORES_MARCO` e o lugar em `EDIFICIOS` (`src/components/mundo/experiencia/cena.js`), além
do nome em `MODULOS.marcos`.

## Duas aprovações

- **Estrutural**: o que `npm run mundo:validar` comprova. Os IDs existem no catálogo, nenhum ID ou chave se repete e toda fonte citada
  existe. Os módulos são conhecidos, cada marco tem texto ligado, os campos obrigatórios estão preenchidos e os tamanhos cabem.
  Sem isso, o perfil não entra.
- **Editorial**: decisão de uma pessoa da Use Origens, registrada em `revisao`. O ciclo é `curadoria inicial`, depois
  `revisão externa`, depois `aprovado`; o `aprovado` leva `por` e `em`. O validador só informa o estado.
  Antes de ligar as entradas da loja (`MEU_PEQUENO_MUNDO=on`), rode `npm run mundo:validar -- --exigir-editorial`.
