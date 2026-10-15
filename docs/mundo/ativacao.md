# Meu Pequeno Mundo — ativação e reversão

A experiência fica em `/meu-pequeno-mundo` e é controlada por **uma variável de runtime**, `MEU_PEQUENO_MUNDO` (`src/lib/mundo/flag.ts`),
e pelo **painel** dentro do limite dessa variável (abaixo).
O padrão é desligado: sem a variável, a produção fica exatamente como antes. A variável é lida na renderização, não no build: o valor
não fica embutido no código.

**Cache.** A página `/meu-pequeno-mundo` e as rotas `/api/mundo/*` são dinâmicas e obedecem na hora. As páginas da loja que mostram as
entradas usam ISR de 1 hora e não são geradas no build. Então:

- Num container novo (o deploy que o Railway faz ao mudar uma variável, ou um restart), o cache começa vazio e as páginas já saem certas.
- Sem container novo, uma página que já está em cache pode mostrar o estado anterior por até 1 hora. Uma sincronização do catálogo ou
  uma publicação do CMS invalidam o cache das regiões na hora (`revalidatePath('/[region]', 'layout')`).

| Valor | Página `/meu-pequeno-mundo` e `/api/mundo/*` | Entradas na loja (home, página de cidade, rodapé) | Indexação |
|---|---|---|---|
| *(não definida)* ou qualquer outro valor | 404 | nenhuma | — |
| `pagina` | respondem; mundos compartilhados abrem | nenhuma | `noindex` |
| `on` | respondem | as três | indexável, com canonical sem parâmetros |

## Pelo painel, sem deploy

Em **Admin → Aparência → Meu Pequeno Mundo** (só o owner), o painel escolhe entre *Ligado*, *Só a página*, *Desligado* e *Seguir o
servidor*. A escolha fica no documento global e vale ao clicar em **Publicar configuração global**. Publicar refaz as páginas das regiões,
então as entradas aparecem ou somem na próxima visita, sem esperar o cache de 1 hora.

A variável continua sendo o **limite**: o painel só abre até onde ela permite.

| Variável | O painel pode escolher |
|---|---|
| `on` | qualquer estado (o painel decide tudo) |
| `pagina` | *Só a página* ou *Desligado* |
| *(não definida)* | nada: fica desligado, qualquer que seja a escolha do painel |

Sem escolha publicada (*Seguir o servidor*), vale só a variável, como antes. Para operar pelo painel, deixe `MEU_PEQUENO_MUNDO=on` uma vez
no Railway e use o painel daí em diante; para uma trava de emergência que o painel não reabre, remova a variável.

## Antes de ligar

1. `npm run mundo:validar -- --exigir-editorial` sem falhas. Perfis sem `revisao.status = "aprovado"` falham nesse modo.
2. Catálogo sincronizado: `/api/ready` com 200. Com o catálogo ainda não pronto, `/api/mundo/indice` responde 503 e a página mostra o
   aviso de erro com nova tentativa.
3. O banner e a regra de consentimento da loja valem para a página: hoje a medição não espera o banner
   (`src/lib/consent/policy.ts`). Não há serviço novo, e Meta Pixel e Clarity não carregam nessa rota.

## Ligar em etapas (Railway, serviço web)

1. `MEU_PEQUENO_MUNDO=pagina`, depois o deploy ou restart. Abra `/meu-pequeno-mundo` e um link compartilhado (`?mundo=1&origem=…`). A loja continua
   sem nenhuma entrada.
2. `MEU_PEQUENO_MUNDO=on`, depois o deploy ou restart. Aparecem três entradas: o bloco na home, depois da escolha de estados; o convite na página
   da cidade, abaixo dos produtos; e o link no rodapé, na lista "Loja".

## Reverter

- **Esconder as entradas e manter os links compartilhados funcionando:** `MEU_PEQUENO_MUNDO=pagina`, depois o deploy ou restart.
- **Desligar tudo:** remover a variável (ou usar `off`), depois o deploy ou restart. A página e os dados voltam a 404, e as entradas somem.
- Nada é gravado no servidor. O mundo de cada visitante fica no navegador dele: `localStorage` e, para um mundo aberto por link,
  `sessionStorage`. Desligar não apaga nem corrompe nada.

## O que a loja carrega com o mundo ligado

- As entradas são HTML do servidor, com links `<a>` simples (sem prefetch) e uma imagem estática leve: o bloco da home usa uma JPEG de
  cerca de 36 KB com `next/image`. Nenhuma página da loja carrega Three.js nem código da experiência.
- O Three.js e a experiência são carregados só em `/meu-pequeno-mundo`, em chunks próprios, depois da hidratação.
- O link antigo do protótipo (`/meu-pequeno-mundo-use-origens.html`) redireciona para `/meu-pequeno-mundo` e preserva os parâmetros.

## Privacidade (resumo)

A página limpa a barra de endereço no primeiro commit, antes de qualquer script de analytics. O GA4 registra só o caminho
(`/meu-pequeno-mundo`), sem a consulta, porque um mundo compartilhado leva lugares e, se a pessoa quiser, lembranças. Os eventos seguem
um contrato fechado (`docs/mundo/eventos.md`).
