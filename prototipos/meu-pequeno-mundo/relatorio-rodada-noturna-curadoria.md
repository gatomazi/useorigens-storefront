# Meu Pequeno Mundo — rodada noturna de curadoria (14–15/10/2026)

Pedido: "uma rodada noturna, pegando os dados do máximo de cidades possíveis". Branch `feature/meu-pequeno-mundo-curadoria-noturna`,
empilhada sobre a v3 (PR #73). Nada publicado nem mergeado.

## Resultado

- **113 perfis curados** (eram 9): 104 cidades novas, todas em `curadoria inicial`. Sul 67, Centro-Oeste 25, Norte 21.
  Entram as 8 capitais que faltavam (Florianópolis, Cuiabá, Brasília, Rio Branco, Macapá, Porto Velho, Boa Vista, Palmas), as maiores
  cidades das três regiões da loja e destinos turísticos (Gramado, Canela, Bonito, Pirenópolis, Foz do Iguaçu, Chapada dos Guimarães,
  Alto Paraíso, São Miguel das Missões, Cambará do Sul, Urubici, Bento Gonçalves e outros). Lista completa em
  `docs/mundo/cobertura-perfis.md` (agora gerado por `npm run mundo:cobertura`).
- **3 cidades pesquisadas ficaram de fora**: Penha, Cachoeirinha e Treze Tílias (motivos abaixo).
- **14 marcos genéricos novos na maquete**: `igreja`, `catedral`, `ruinas`, `palacio`, `coreto`, `monumento`, `mirante`, `estacao`, `forte`,
  `farol`, `trapiche`, `ponte-pensil`, `cachoeira` e `vinhedo`. Servem a muitas cidades; a nota de cada perfil diz o que é ilustrativo.
  Nenhuma forma imita obra autoral (Niemeyer, Lucio Costa, estátuas assinadas): nesses casos a referência ficou só com texto ou com
  forma genérica avisada na nota.
- **Perfis por cidade**: a página deixou de baixar o arquivo inteiro de perfis. Cada perfil sai sozinho, só com as fontes que cita
  (`/api/mundo/perfis/<id>.json` na loja, `contexto/perfis/<id>.json` no protótipo), e só para os lugares do mundo. O índice do catálogo
  marca com `p: 1` quem tem perfil, então cidade sem perfil não gera requisição nem 404. Com 113 perfis, o arquivo inteiro teria
  ~920 KB (~225 KB comprimido); hoje cada ilha baixa ~9 KB.

## Como foi feito

1. **Base do IBGE por script** (160 cidades): sede (Localidades 2022), população e área (Censo 2022, SIDRA 4714), regiões (API de
   Localidades), histórico, formação administrativa e gentílico (Biblioteca do IBGE). Esses números não passaram por agente.
2. **Pesquisa por agentes**, 3 cidades cada, com o guia `evidencias-noturna/guia-dos-agentes.md` (regras de `docs/mundo/curadoria.md`):
   fonte primária, texto próprio, datas administrativas separadas, sem superlativo nem promessa, divergências registradas.
3. **Conferência mecânica de cada fato**: todo fato publicado tem uma evidência com o **trecho literal** da fonte. Um script baixa a
   página (HTML ou PDF) e confere se o trecho está lá; o perfil só entra com `npm run mundo:validar` sem falha e todas as evidências
   achadas. Exceções (trecho copiado à mão de site que só abre com JavaScript) ficaram marcadas como MANUAL e listadas abaixo.
4. **Conferência visual**: os 14 marcos foram testados numa bancada com perfis falsos; as ilhas dos perfis reais foram fotografadas por
   amostragem (`evidencias-noturna/ilhas-lote-a.png` e `ilhas-lote-b.png`). Ajustes que saíram daí: árvores altas afastadas dos marcos
   genéricos e da faixa entre o marco e a câmera (a mata escondia a igreja), farol maior.

A cota de buscas na web (200 por sessão) acabou no começo da noite. Daí em diante os agentes acharam as fontes navegando direto nos
sites oficiais (prefeituras, câmaras, Iphan, governos estaduais, ICMBio) e na Enciclopédia dos Municípios do IBGE (1957–1959). Por isso
muitas cidades usam a Enciclopédia para paisagem e tradições, sempre atribuída e no passado.

## Validação

| O quê | Resultado |
|---|---|
| `npm run mundo:validar` | 113 perfis, 779 fontes, nenhuma falha (1 aviso: fontes antigas dos pilotos declaradas e não citadas) |
| QA da integração na loja (`mini-mundo-v3.mjs`, build de produção com `MEU_PEQUENO_MUNDO=on`) | **71/71**, 0 erro de console (os modos `pagina` e `off` não mudaram nesta rodada e não foram repetidos) |
| Suíte da v2.1 na página da loja | **60/60**, 0 erro de console |
| Suíte da v2.1 no protótipo regenerado | **60/60**, 0 erro de console |
| `vitest` | 1.381/1.381 |
| `eslint` e `tsc` nos arquivos alterados | sem erros |

Durante a noite, duas regressões do carregamento por cidade apareceram no QA e foram corrigidas antes do commit final: a cena podia
criar as ilhas antes de os perfis chegarem (o estado fica em "carregando" até eles chegarem) e cidades sem perfil geravam 404 no console
(resolvido com a marca `p` no índice). Uma checagem da suíte v2.1 usava Bagé como "cidade sem perfil"; passou a usar Abatiá (PR).

## O que pede revisão humana

Nenhum perfil novo está aprovado. Além do que cada `revisao.observacao` registra, estes pontos merecem atenção primeiro:

- **Evidências copiadas à mão** (site só com JavaScript ou cookie): Cascavel (3 trechos) e São Leopoldo (5, Museu do Trem).
- **Fontes fracas**: Gravataí (só IBGE, inclusive 1959), Cametá (só IBGE), Várzea Grande (boa parte de 1958), Marabá (IBGE e inventário
  Setur de 2021), Pinhais (2 fontes), Chapecó (paisagem só de 1959).
- **Urubici**: a página "Dados do Município" da Prefeitura parece copiada da Wikipédia, sem dizer; dela vêm altitude, paisagem, a
  temperatura de −17,8 °C e a etimologia.
- **Fazenda Rio Grande**: boa parte vem de uma cartilha infantojuvenil da Secretaria de Cultura.
- **Tom e temas sensíveis**: Pelotas (as fontes não tratam do trabalho escravizado nas charqueadas), Ananindeua (Quilombo do Abacatal),
  Bragança (Marujada descrita em termos de época em 1957), Uruguaiana (curiosidade sobre a Guerra do Paraguai).
- **Marcos que podem não existir mais ou não bater com o real**: estação de Pinhais, Feitoria Velha (São Leopoldo), ruínas da Cimba
  (Araguaína, forma de usina), catedrais modernas com forma genérica (Sinop, Cascavel, Maringá ficou só com texto), torres laterais
  representadas como centrais (Pirenópolis, Morretes, Lapa, Chapada dos Guimarães, Bagé — a nota avisa).
- **Escolhas de cenário**: Viamão usa água de costa para a Laguna dos Patos (para o farol de Itapuã); Cambará do Sul representa o
  Itaimbezinho com o marco de cachoeira (não há módulo de cânion); Luziânia usa um lago a 27 km da sede.
- **Sem marco clicável**: Bombinhas e Águas Lindas de Goiás.
- **Datas de 1957–1959** (Enciclopédia do IBGE) aparecem atribuídas e no passado; vale conferir se continuam valendo (festas, cais,
  samaumeira de Cametá, Missa da Saúde em Sapucaia do Sul).

## Ficaram de fora

- **Penha (SC)**: o domínio da Prefeitura não resolve e o portal só abre com JavaScript; 14 dos 20 trechos foram copiados à mão.
- **Cachoeirinha (RS)**: 20 dos 32 trechos copiados à mão (portal só com JavaScript, lido no Chrome — uma aba pode ter ficado aberta).
- **Treze Tílias (SC)**: site da Prefeitura com certificado vencido; nenhum lugar com fonte para virar marco (rascunho parcial).

Os rascunhos dessas três estão guardados fora do repositório e podem entrar quando houver fonte conferível.

## Pendências

- Revisão editorial dos 104 perfis novos (e dos 9 anteriores).
- Regiões Administrativas do DF continuam sem perfil: o modelo pede população do Censo, que o IBGE não publica por RA.
- Próximas cidades da fila (ordem por população, intercalada com destinos turísticos): Umuarama, Formosa e Sarandi já entraram;
  seguem Torres, Catalão, Marituba, Sorriso, Soure, Tubarão, Itumbiara e outras ~45 já com a base do IBGE baixada.
- O pacote ZIP da v3 não foi regenerado nesta rodada.
- Seguem as pendências da v3: aparelhos reais e DebugView do GA4.
