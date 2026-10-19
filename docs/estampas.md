# Estúdio de estampas

O link da usuária é **`/estampas`**. Ele tem login por usuário e senha, sem menus, regiões ou outras telas do painel. A sessão é independente da autenticação Railway do administrador e não concede permissões em `/admin`.

O responsável mantém `/admin/estampas` para disponibilizar modelos e baixar os PNGs pela galeria. A usuária pode criar, salvar e reabrir estampas; a publicação de modelos e o download do PNG final continuam no acesso administrativo.

O fluxo principal é **escolher modelo → editar textos e logo → Salvar estampa**. As artes de camiseta têm **4270 × 4900 pixels**, o tamanho dos dois arquivos de referência. O PNG preserva transparência e registra a resolução física do projeto (300 dpi nos modelos iniciais). A cor da camiseta é uma simulação da prévia e não entra no arquivo.

Cada salvamento cria uma versão independente no servidor, com a imagem final, uma miniatura e a composição editável. Abrir uma arte da galeria e salvar cria outra versão. A imagem anterior continua disponível. A galeria apresenta os 500 salvamentos mais recentes, incluindo modelos.

## Modelos e recursos

Os dois modelos iniciais ficam em `src/lib/print-studio/model.ts`: **Feliz tudo** e **Quem peleia**. Usam Hanken Grotesk inicialmente. O seletor também oferece **Mont ExtraLight** e **Mont Heavy**, a partir dos dois OTFs fornecidos, guardados sem alteração em `assets/print-studio/fonts/`. Os arquivos são disponibilizados somente depois da autenticação. Ao escolher uma dessas fontes, seu arquivo e peso exatos são incorporados à composição salva.

**Logos da Origens** oferece Sul, Norte e Centro-Oeste, cada uma nas versões clara e escura. Os seis PNGs fornecidos ficam em `assets/print-studio/logos/`, preservados sem alteração. A prévia da biblioteca usa fundo contrastante; a logo clara é indicada para camisetas escuras e a escura para camisetas claras. **Adicionar logo** insere a imagem abaixo dos textos. Com uma imagem selecionada, **Trocar selecionada** preserva posição, largura e agrupamento.

As logos são servidas somente pelas rotas autenticadas `/estampas/logos/[id]` e `/admin/estampas/logos/[id]`. Ao inserir uma logo, o PNG original é incorporado à composição, que continua editável mesmo se a biblioteca mudar no futuro. A logo pode ser redimensionada, arrastada e agrupada como as outras imagens.

Para preparar uma nova base, o owner pode ajustar o editor, enviar arquivos em **Fontes e imagem de referência** e usar **Salvar como modelo**. O modelo fica disponível no seletor para os outros usuários. Também é possível importar um `.json` editável (schema `PrintProject` em `model.ts`), conferir a prévia e salvar como modelo. A esposa não precisa lidar com esses arquivos.

Um PNG de referência não é convertido automaticamente em texto: funciona como guia visual, separado das camadas e excluído da arte final. Fontes TTF/OTF/WOFF/WOFF2 e logos PNG/JPG/WebP são incorporadas à composição salva no servidor. Cada arquivo pode ter até 8 MB; uma composição pode ter até 40 camadas e 20 fontes. Para o desenho exato de uma variante em negrito, envie o arquivo correspondente, que pode ser escolhido como fonte independente.

## Alinhamento e agrupamento

- Marque os itens pelas caixas da lista ou use Shift + clique na prévia. **Selecionar todos** inclui todas as camadas.
- **Agrupar** associa os itens. Arrastar qualquer membro move o grupo inteiro, preservando a distância entre eles. **Desagrupar** permite mover os itens individualmente outra vez.
- **Centro horizontal**, **Centro vertical** e **Centro da arte** centralizam a seleção como um bloco. Para centralizar a composição inteira, selecione todos primeiro.
- **Guias e encaixe** mostra os eixos centrais e encaixa o arraste nos eixos, nas bordas da arte e nas bordas/centros dos outros elementos. A linha rosa mostra o encaixe ativo. Segure Alt para arrastar livremente.
- Grupos são preservados em modelos, rascunhos e estampas salvas. Guias e contornos da seleção não entram na imagem final.

## Usuário e senha no Railway

Configure estas variáveis no serviço web, sem colocá-las no Git:

| Variável | Valor |
| --- | --- |
| `PRINT_STUDIO_ORIGIN` | Origem exata do link, como `https://www.useorigens.com.br`, sem barra final. Em desenvolvimento: `http://127.0.0.1:3000`. |
| `PRINT_STUDIO_USERNAME` | Usuário de acesso ao editor. |
| `PRINT_STUDIO_PASSWORD_HASH` | Hash scrypt da senha, gerado pelo comando abaixo. |
| `PRINT_STUDIO_SESSION_SECRET` | Segredo aleatório próprio do editor, com pelo menos 32 caracteres. Por exemplo, gere com `openssl rand -hex 32`. |

Para gerar o hash no zsh, lendo a senha sem colocá-la nos argumentos do processo ou no histórico:

```zsh
read -s 'studio_password?Senha do editor (mínimo 8 caracteres): '
printf '%s' "$studio_password" | node --import tsx scripts/print-studio-password.mts
unset studio_password
```

Copie somente o hash impresso para a variável `PRINT_STUDIO_PASSWORD_HASH`. O editor não aceita senha padrão e não abre se a configuração estiver incompleta. Mudar a senha ou o segredo invalida as sessões anteriores. O cookie dura 12 horas, é HttpOnly, SameSite=Strict, fica restrito a `/estampas` e exige HTTPS em produção. Há limitação de tentativas de entrada e validação de origem nos envios. As configurações do editor não criam uma conta nem uma sessão no painel administrativo.

## Armazenamento e Railway

Em desenvolvimento, os arquivos ficam em `<ADMIN_DEV_DATA_DIR>/estampas` (por padrão `data/admin-dev/estampas`). Em produção, ficam em `<SITE_CONFIG_DIR>/estampas`; o padrão de `SITE_CONFIG_DIR` já usa o Volume do catálogo, em `site-config/`. O diretório **precisa estar no Volume persistente do Railway**, como as outras publicações do CMS. Não use o disco efêmero do container.

Se necessário, configure `PRINT_STUDIO_DIR` com um caminho absoluto em um Volume persistente. A variável só é usada em produção. Não requer outro bucket, nova tabela ou migração. A arquitetura continua usando uma instância, conforme a configuração existente do Volume.

Cada salvamento publica uma pasta por rename atômico, sem índice compartilhado que possa perder uma gravação concorrente. Os arquivos só são servidos por rotas autenticadas: o editor usa `/estampas/arquivos/` para miniaturas e composições; o administrador também pode baixar o PNG por `/admin/estampas/arquivos/`. Nada entra no catálogo ou na biblioteca pública de mídia. Inclua o diretório de estampas no backup do Volume.

Há um rascunho de recuperação no IndexedDB do navegador. Ele não substitui **Salvar estampa**: só o botão envia e confirma a gravação no servidor. Se o envio falhar, a edição continua aberta e pode ser reenviada.

## Desenvolvimento e validação

```bash
npm run dev -- -H 127.0.0.1
# http://127.0.0.1:3000/estampas (configurar as quatro variáveis acima no .env.local)

npm run typecheck
npm test -- tests/unit/print-studio*.test.ts
```

A interface herda a tipografia e os controles do painel. Seu modo é Operate: modelos e edição por camada à esquerda, prévia à direita; no celular a prévia vem antes dos controles. Ajustes de posição, fontes e referência ficam em seções expansíveis.
