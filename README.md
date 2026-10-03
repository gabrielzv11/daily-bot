# daily-bot

Bot que monta o resumo da daily de um desenvolvedor. Todo dia útil, de madrugada (agendado para 02:17, horário de Brasília — o GitHub pode atrasar execuções agendadas, às vezes por horas), coleta os commits do dia útil anterior nos repositórios monitorados, resume com IA (Gemini ou Mangaba Router) e publica o resultado como **issue** neste repositório e, opcionalmente, como **nota no vault do Obsidian**.

## Sumário

- [Como funciona](#como-funciona)
  - [Estrutura](#estrutura)
- [Configuração](#configuração)
  - [1. GitHub (repositório do bot)](#1-github-repositório-do-bot)
    - [Formato de `GH_REPOS`](#formato-de-gh_repos)
    - [Exemplo de configuração](#exemplo-de-configuração)
  - [2. GitHub Actions](#2-github-actions)
  - [3. Obsidian](#3-obsidian)
- [Segurança e privacidade](#segurança-e-privacidade)
- [Rodar localmente](#rodar-localmente)
- [Monitorar outros repositórios](#monitorar-outros-repositórios)
- [Limitações conhecidas](#limitações-conhecidas)
- [Próximos passos](#próximos-passos)
- [Licença](#licença)

## Como funciona

1. **Janela de tempo** ([src/window.ts](src/window.ts)) — 00:00 a 23:59 no horário de Brasília (UTC-3, sem horário de verão). Sem `TARGET_DATE` ([execução manual](#2-github-actions) ou [local](#rodar-localmente)), resume o dia útil anterior: segunda → sexta, domingo → sexta, demais dias → ontem. `TARGET_DATE` com data inexistente (ex.: `2026-02-31`) derruba o job.
2. **Coleta** ([src/github/collect.ts](src/github/collect.ts)) — para cada repositório de `GH_REPOS` ([formato](#formato-de-gh_repos)), lista todas as branches e busca os commits do `GH_AUTHOR` na janela. Branches de feature são processadas antes das padrão (`main`, `master`, `develop`, `development`, `homolog`, `staging`), para o commit ficar associado à branch onde nasceu. Merges e duplicados são ignorados.
3. **Enriquecimento** — para cada commit busca os arquivos alterados (status, +/− linhas; até 30 por commit, 5 requisições simultâneas). O `patch` (código) é descartado: só metadados são usados.
4. **Resumo** ([src/summarizers/](src/summarizers/index.ts)) — se `GEMINI_API_KEY` (ou `MANGABA_API_KEY`, ver [variáveis](#1-github-repositório-do-bot)) existir, envia mensagens e arquivos ao provedor de IA, que gera um texto em português, primeira pessoa e passado, com tópicos por repositório e a seção "Para falar na daily". Sem chave, ou se a API falhar, usa só a lista bruta de commits.
5. **Projetos** ([src/config.ts](src/config.ts)) — repos com o mesmo destino de documentação ([formato](#formato-de-gh_repos)) formam um projeto, com um resumo e uma issue só. Um repo que não pode ser lido (token ausente, 404, timeout) fica fora do resumo, com aviso na nota, e o job termina com erro; se nenhum repo do projeto for lido, o projeto falha sem publicar. Um projeto que falha não impede os outros.
6. **Publicação** ([src/publishers/](src/publishers/index.ts)) — cada publisher habilitado ([issue](src/publishers/providers/issue.ts), [Obsidian](#3-obsidian)) recebe a mesma nota. Falha em um não impede os outros, mas o job termina com erro. Na issue, a lista bruta é truncada (`… +N commits`) se o corpo passar do limite de 65 536 caracteres da API.

O resumo também é escrito no _Job Summary_ do [GitHub Actions](#2-github-actions).

### Estrutura

```
src/
  index.ts              orquestração: projetos → coleta → resumo → publicação
  config.ts             lê GH_REPOS, agrupa em projetos e resolve tokens
  config.test.ts        testes do parser (bun test)
  types.ts              tipos de commit, relatório e janela de dia
  window.ts             janela de tempo (horário de Brasília, dia útil anterior)
  github/
    client.ts           headers e helpers (get/lista paginada) da API do GitHub
    collect.ts          commits por repositório e arquivos alterados
    index.ts
  report.ts             lista bruta de commits em Markdown
  summarizers/
    index.ts            escolhe o provedor (SUMMARY_PROVIDER ou o primeiro com chave)
    index.test.ts
    prompt.ts           prompt único, igual para todos os provedores
    types/
      summarizer.ts     contrato: Summarizer e SummarizerFactory
    providers/
      gemini.ts         Gemini
      mangaba.ts        Mangaba Router (OpenAI-compatível)
  publishers/
    index.ts            roda os publishers habilitados
    types/
      publisher.ts      contrato: Publisher, DailyNote e PublishContext
    providers/
      issue.ts          cria issue no repo do bot
      obsidian.ts       grava nota no repo do vault
.github/workflows/daily.yml
```

Para adicionar um provedor de IA novo: crie um arquivo em [src/summarizers/providers/](src/summarizers/providers/gemini.ts) que exporte um `SummarizerFactory` ([contrato](src/summarizers/types/summarizer.ts)) (`name`, `create()` que retorna `null` sem chave) e inclua em `FACTORIES` em [src/summarizers/index.ts](src/summarizers/index.ts).

Para adicionar um destino novo: crie um arquivo em [src/publishers/providers/](src/publishers/providers/issue.ts) que implemente `Publisher` ([contrato](src/publishers/types/publisher.ts); `name` e `prepare(ctx)`, que resolve a configuração do destino e devolve a função de publicação já tipada, ou `null` quando o projeto não tem o necessário) e inclua em `PUBLISHERS` em [src/publishers/index.ts](src/publishers/index.ts).

## Configuração

### 1. GitHub (repositório do bot)

Em **Settings → Secrets and variables → Actions**:

| Nome                       | Tipo     | Obrigatório | Descrição                                                                                                                                                                    |
| -------------------------- | -------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GH_AUTHOR`                | variable | sim         | Login do GitHub cujos commits serão resumidos (também é o assignee da issue)                                                                                                 |
| `GH_REPOS`                 | variable | sim         | Repos monitorados e o destino de cada um ([formato](#formato-de-gh_repos))                                                                                                   |
| `GH_TOKEN_<DONO>`          | secret   | sim*        | PAT do dono (ex.: `GH_TOKEN_GABRIELZV11` para `gabrielzv11`). Lê os repos dele e, se o dono também tiver repo de docs, grava nele                                            |
| `DOCS_FOLDER`              | variable | não         | Pasta das notas nos docs (padrão `Daily`)                                                                                                                                    |
| `DOCS_BRANCH`              | variable | não         | Branch dos docs (padrão: a default do repo)                                                                                                                                  |
| `GEMINI_API_KEY`           | secret   | não         | Chave da API do Gemini. Sem ela, só a lista bruta é publicada                                                                                                                |
| `GEMINI_MODEL`             | variable | não         | Modelo (padrão `gemini-2.5-flash`). `auto` = escolhe o Flash estável mais recente disponível para a chave (pode mudar de comportamento sem aviso quando sair um modelo novo) |
| `GEMINI_MAX_OUTPUT_TOKENS` | variable | não         | Limite de tokens da resposta (padrão `8192`). Se o resumo sair cortado, aumente                                                                                              |
| `GEMINI_THINKING_BUDGET`   | variable | não         | Tokens de raciocínio do modelo, que consomem o limite acima (padrão `0` = desligado; `-1` = dinâmico)                                                                        |
| `SUMMARY_PROVIDER`         | variable | não         | `gemini` ou `mangaba`. Vazio = Gemini se houver `GEMINI_API_KEY`, senão Mangaba se houver `MANGABA_API_KEY`                                                                  |
| `MANGABA_API_KEY`          | secret   | não         | Chave do [Mangaba Router](https://mangabarouter.store/docs) (`mr-...`)                                                                                                       |
| `MANGABA_MODEL`            | variable | não         | Modelo (padrão `mangaba-mini`; `mangaba-fast` tem só 8k de contexto)                                                                                                         |
| `MANGABA_BASE_URL`         | variable | não         | Base da API OpenAI-compatível (padrão `https://mangabarouter.store/v1`)                                                                                                      |
| `MANGABA_MAX_TOKENS`       | variable | não         | Limite de tokens da resposta (padrão `4096`). Se o resumo sair cortado, aumente                                                                                              |

\* Para cada dono em `GH_REPOS`, e para cada dono de repo de destino, precisa existir o secret `GH_TOKEN_<DONO>`. Não há token genérico. O nome do secret é o dono em maiúsculas com `-` e `.` trocados por `_`. Sem o token, os repos daquele dono ficam fora do resumo (com aviso na nota) e o job termina com erro.

#### Formato de `GH_REPOS`

```
# minha-org
[app-web](https://github.com/gabrielzv11/notas)
[app-api](https://github.com/gabrielzv11/notas)
# gabrielzv11
[site](https://github.com/gabrielzv11/estudos)
```

- `# dono` define o dono dos repos abaixo, até o próximo título.
- `[repo](destino)`: o texto é o repo monitorado e a URL (ou `owner/repo`) é o repo de documentação que recebe o resumo.
- Repos com o **mesmo destino** viram um projeto: uma nota e uma issue, com o nome do destino no título.
- Repo sem link não tem destino: só a issue é criada. Vários repos podem ficar na mesma linha (`repo-a, repo-b`), e `dono/repo` dispensa o título.
- Linha inválida (sem dono, destino malformado) derruba o job com o número da linha.

`GITHUB_TOKEN` é fornecido automaticamente pelo Actions.

#### Exemplo de configuração

Usuário trabalha em projetos de terceiro ou uma organização: `empresa_repos`, resumo gerado pela Mangaba e notas gravadas no repo de docs de `gabrielzv11` (ver [tabela de variáveis](#1-github-repositório-do-bot) e [formato de `GH_REPOS`](#formato-de-gh_repos)).

**Secrets**

| Nome                     | Para quê                                             |
| ------------------------ | ---------------------------------------------------- |
| `GEMINI_API_KEY`         | Chave do Gemini                                      |
| `MANGABA_API_KEY`        | Chave do Mangaba Router                              |
| `GH_TOKEN_GABRIELZV11`   | PAT de `gabrielzv11`: grava as notas no repo de docs |
| `GH_TOKEN_EMPRESA_REPOS` | PAT de `empresa_repos`: lê os repos monitorados      |

**Variables**

| Nome               | Valor              | Para quê                                       |
| ------------------ | ------------------ | ---------------------------------------------- |
| `SUMMARY_PROVIDER` | `mangaba`          | `mangaba` ou `gemini` se houver as duas chaves |
| `GEMINI_MODEL`     | `gemini-2.5-flash` | Opcional                                       |
| `GH_AUTHOR`        | `gabrielzv11`      | Serve de filtragem dos commits monitorados     |
| `GH_REPOS`         | ver abaixo         | Repos monitorados e destino das notas          |

Valor de `GH_REPOS`:

```
# gabrielzv11
[meu-app-exemplo](https://github.com/gabrielzv11/meus-projetos)
[meu-app2-exemplo](https://github.com/gabrielzv11/meus-projetos)
[meu-app3-exemplo](https://github.com/gabrielzv11/meus-projetos)
# empresa_repos
[app-exemplo](https://github.com/gabrielzv11/docs-empresa)
```

### 2. GitHub Actions

Workflow: [.github/workflows/daily.yml](.github/workflows/daily.yml).

- **Agendamento**: `cron: '17 5 * * 1-5'` (05:17 UTC = 02:17 em Brasília, seg–sex). O Actions pode atrasar execuções agendadas, às vezes por horas em horário cheio; por isso o cron roda de madrugada e fora do minuto 0, com folga até o resumo ser necessário (10h).
- **Sem configuração**: se a variable `GH_REPOS` estiver vazia (ex.: cópia recém-criada do template), o job é pulado em vez de falhar.
- **Execução manual**: aba _Actions → Resumo diário → Run workflow_. O campo `date` (`AAAA-MM-DD`) permite resumir um dia específico; vazio = dia útil anterior.
- **Permissões**: `contents: read` e `issues: write` (necessário para criar a issue).
- **Passos**: checkout → `setup-bun` → `bun run src/index.ts`. Não há `bun install`: o bot não tem dependências de execução.
- **Timeout**: `timeout-minutes: 10` no job, e cada requisição tem teto próprio (60 s no GitHub, 240 s nos provedores de IA). Timeout na IA cai na lista bruta.
- **Secrets**: o workflow passa `toJSON(secrets)` em `ALL_SECRETS`, e o bot escolhe o token por dono. Criar um secret novo não exige editar o YAML.

### 3. Obsidian

O bot **não** fala com o Obsidian diretamente: grava um arquivo Markdown no repositório Git do vault via API de _contents_ do GitHub, e o Obsidian sincroniza por pull.

1. Tenha o vault versionado em um repositório GitHub.
2. Crie um PAT (fine-grained) com acesso ao repo do vault e permissão **Contents: Read and write**. Salve como secret `GH_TOKEN_<DONO>` do dono do repo do vault (ver [tabela de secrets](#1-github-repositório-do-bot)).
3. Aponte o destino no link de cada repo em `GH_REPOS` ([formato](#formato-de-gh_repos)) e, se quiser, defina `DOCS_FOLDER` / `DOCS_BRANCH`.
4. No Obsidian, instale o plugin **Obsidian Git** e configure _auto pull_ (intervalo em minutos e/ou pull ao abrir o vault).

O publisher só liga para projetos com destino **e** token de escrita. Se houver destino sem token, avisa no log e fica desativado para aquele projeto, sem falhar o job.

Formato da nota, em `<DOCS_FOLDER>/AAAA-MM-DD.md`:

```markdown
---
date: 2026-09-28
tags: [daily]
commits: 4
repos: [app-web]
---

# Daily — segunda-feira, 28/09/2026

(resumo da IA)

> [!note]- Commits (4)
> (lista bruta em callout recolhido)
```

Reexecutar o dia sobrescreve a nota (o bot lê o `sha` existente antes do `PUT`). Cada gravação gera um commit `daily: AAAA-MM-DD` no vault.

## Segurança e privacidade

- **Mantenha o repositório do bot privado.** Issues, logs e _Job Summaries_ das execuções trazem mensagens de commit, nomes de branch e de repositórios e links para eles. Em um repositório público, tudo isso fica visível para qualquer pessoa. Ao criar a partir do template, escolha **Private**. Tornar público depois expõe também as issues e execuções anteriores.
- **O bot recebe todos os secrets do repositório.** O workflow passa `toJSON(secrets)` em `ALL_SECRETS` para que um `GH_TOKEN_<DONO>` novo não exija editar o YAML. Em troca, qualquer código que rode nesse step enxerga todos os secrets. Não guarde neste repositório secrets que não sejam do bot.
- **Tokens com o mínimo de permissão.** Use PATs _fine-grained_, com expiração e só com os repositórios necessários:
  - repos monitorados: **Contents: Read-only**;
  - repo de docs (vault): **Contents: Read and write**.

  Em um PAT fine-grained, a permissão vale para todos os repositórios selecionados nele. Se o mesmo dono tem repos monitorados e o repo de docs, o `GH_TOKEN_<DONO>` precisa de escrita e passa a tê-la em todos os repos selecionados. Para reduzir isso, mantenha o vault em uma conta ou organização separada.

- **Dados enviados ao provedor de IA.** Com uma chave de IA configurada, o bot envia ao provedor (Gemini ou Mangaba Router) as mensagens de commit, os nomes de branch e repositório e os caminhos dos arquivos alterados, **sem o código**. Confira a política de uso de dados do provedor (o plano gratuito do Gemini pode usar o conteúdo para melhorar os produtos do Google) e se o contrato ou NDA dos repositórios de clientes permite isso. Sem chave de IA, nada sai do GitHub.
- **`MANGABA_BASE_URL` recebe a chave do Mangaba.** Como é uma _variable_, quem pode editar variables do repositório pode apontá-la para outro servidor e capturar a chave.
- **Dependências do workflow.** A action `oven-sh/setup-bun`, que instala o binário que roda com os secrets, está fixada por SHA, e a versão do Bun está fixa. O Dependabot ([.github/dependabot.yml](.github/dependabot.yml)) abre PR quando há versão nova da action. O job não roda `bun install`.
- **Execução local escreve de verdade.** Com destino de docs e token configurados, rodar localmente grava a nota no vault real. Só a issue é substituída por saída no console.

## Rodar localmente

Requer [Bun](https://bun.sh). As variáveis são as mesmas da [configuração do GitHub](#1-github-repositório-do-bot).

```bash
bun install
GH_TOKEN_GABRIELZV11=... GH_AUTHOR=gabrielzv11 GH_REPOS=gabrielzv11/repo-a,gabrielzv11/repo-b bun run start
```

Variáveis opcionais: `GEMINI_API_KEY`, `GEMINI_MODEL`, `TARGET_DATE=AAAA-MM-DD`, `DOCS_*`. Fora do Actions (sem `GITHUB_REPOSITORY`/`GITHUB_TOKEN`) a issue não é criada: o resultado é impresso no console.

```bash
bun run typecheck
bun test
```

## Monitorar outros repositórios

Edite a variable `GH_REPOS` ([formato](#formato-de-gh_repos), [exemplo](#exemplo-de-configuração)). Para um dono novo, crie o secret `GH_TOKEN_<DONO>` com acesso de leitura aos repos dele. Para um destino novo de documentação, o token do dono do destino precisa de escrita em _Contents_ (ver [Obsidian](#3-obsidian)).

## Limitações conhecidas

**Quais commits entram**

- **Push atrasado se perde.** A janela usa a data do commit, não a do push, e o bot não guarda estado entre execuções. Um commit feito na sexta e enviado na segunda depois da execução das 02:17 não aparece em nenhuma daily.
- **Rebase, amend e cherry-pick reaparecem.** Eles reescrevem a data do commit, então trabalho antigo volta como se fosse do dia anterior.
- **Squash merge conta duas vezes.** Os commits da branch entram no dia em que foram feitos, e o commit de squash, que não é tratado como merge, entra de novo no dia do merge.
- **Só commits do login de `GH_AUTHOR`.** Commits feitos com um e-mail que não está vinculado à conta do GitHub não são encontrados, e não há aviso.
- **Só commits.** PRs abertos ou revisados, comentários de review e issues não entram no resumo.
- **Branch de origem é uma heurística.** Um commit presente em várias branches de feature fica associado a qualquer uma delas. Se a branch de feature já foi apagada, ele fica associado à branch padrão.

**Datas**

- **Fim de semana e feriados.** Na segunda, o bot resume só a sexta: o trabalho de sábado e domingo nunca entra. Feriados não são considerados.
- **Fuso fixo em UTC-3** (horário de Brasília), em [src/window.ts](src/window.ts).

**Resumo**

- **Prompt fixo**: português do Brasil, com a persona de desenvolvedor front-end ([src/summarizers/prompt.ts](src/summarizers/prompt.ts)).
- **Sem failover entre provedores.** Se o provedor escolhido falhar, o bot publica a lista bruta sem tentar o outro, e a nota não diz que o resumo falhou.
- **Entrada sem limite de tamanho.** Um dia com muitos commits pode estourar o contexto do modelo (`mangaba-fast` tem 8k). Nesse caso a API recusa e o bot cai na lista bruta. Cada commit envia no máximo 30 arquivos.

**Publicação**

- **Reexecutar duplica a issue.** A nota do Obsidian é sobrescrita, mas a issue é criada de novo. As issues também se acumulam abertas, sem label.
- **Reexecução pode piorar a nota.** Se a IA falhar numa reexecução, a nota do Obsidian que já tinha resumo é sobrescrita por uma versão só com a lista bruta.

**Execução**

- **Uma instalação por pessoa.** `GH_AUTHOR` aceita um login só.
- **Repositórios com muitas branches.** O bot faz uma requisição por branch, todas ao mesmo tempo e sem nova tentativa em caso de erro. Repos com centenas de branches podem esbarrar no limite de requisições do GitHub. O repo então fica fora do resumo, com aviso na nota.
- **Timeout do job.** Os projetos rodam um de cada vez, e cada chamada de IA pode levar até 240 s. Com três ou mais projetos e a IA travada, o job pode passar dos 10 min de `timeout-minutes`. Se for o seu caso, aumente esse valor em [.github/workflows/daily.yml](.github/workflows/daily.yml).

## Próximos passos

- Modificar a profundidade de leitura de commits:
  - **Superficial**: lê apenas o título do commit.
  - **Completo**: lê as diffs completas para entender as modificações.
- Adicionar integração com NotebookLM

## Licença

[MIT](LICENSE).
