# CLAUDE.md — Alicerce

**Projeto:** Alicerce — API de simulação de financiamento imobiliário
**Repositório:** `alicerce-api`

## Quem sou eu

Natan Furletti. Recém-formado em Análise e Desenvolvimento de Sistemas, cursando pós em
Engenharia de Software, Arquitetura de Software e Inteligência Artificial. Estou construindo
este projeto como **peça central de portfólio para conseguir minha primeira vaga como
desenvolvedor backend júnior no Brasil**.

Atuei três anos como corretor de imóveis na Riva Incorporadora (Grupo Direcional). Domino o
domínio de negócio deste projeto — financiamento imobiliário, matemática financeira, análise de
crédito. **Não me explique o negócio; me questione sobre ele.** Se uma regra que eu descrever
estiver errada ou incompleta, aponte.

## Por que este projeto existe

O mercado júnior no Brasil está saturado de CRUDs de tutorial. Este projeto precisa provar três
coisas para um tech lead que abrir o repositório por cinco minutos:

1. Sei modelar **regra de negócio densa e real**, não só persistir dados.
2. Sei aplicar **arquitetura em camadas, testes e boas práticas** de verdade.
3. Sei **entregar** — Docker, CI, documentação, deploy funcionando.

Toda decisão técnica deve ser avaliada por esse filtro.

## Modo de trabalho

**Você escreve o código, eu reviso.** Mas com uma condição inegociável:

> Eu vou precisar defender cada linha deste projeto numa entrevista técnica. Um projeto que eu
> não consigo explicar é pior que nenhum projeto.

Portanto, ao implementar:

- Antes de escrever um bloco não trivial, explique em duas ou três linhas **qual decisão você
  tomou e por quê**, e qual era a alternativa descartada.
- Ao final de cada etapa do roadmap, me faça **duas ou três perguntas** sobre o que acabou de ser
  implementado, no nível de uma entrevista técnica. Se eu errar, explique.
- Nunca introduza uma biblioteca nova sem justificar a escolha.
- Se eu pedir algo que seja má prática, **discorde e explique** em vez de obedecer.

## Stack (fixa — não trocar sem discutir comigo)

- Node.js LTS + TypeScript em `strict: true`
- NestJS
- PostgreSQL + Prisma ORM
- Jest para testes (unitários e e2e)
- Docker + Docker Compose
- Swagger/OpenAPI para documentação
- GitHub Actions para CI
- Zod ou class-validator para validação de entrada

Ambiente já configurado: Node, Git e Docker instalados.

## Arquitetura

Clean Architecture pragmática. A regra que importa: **o domínio não conhece framework nem
banco.**

```
src/
  domain/          # entidades, value objects, erros de domínio, interfaces de repositório
  application/     # casos de uso, DTOs de entrada/saída
  infra/
    database/      # Prisma, implementações de repositório, mappers
    http/          # controllers, guards, filtros de exceção
    auth/          # JWT, hashing
  shared/          # utilitários, Result/Either, tipos comuns
  main.ts
```

Regras:

- `domain/` não importa nada de `@nestjs/*`, `@prisma/client` nem de `infra/`. As calculadoras
  financeiras são **TypeScript puro** e testáveis sem subir nada.
- Casos de uso dependem de **interfaces** de repositório, nunca de implementações.
- Controllers são finos: validam entrada, chamam o caso de uso, mapeiam a saída. Zero regra de
  negócio.
- Erros de domínio são classes próprias, traduzidas para HTTP num exception filter. Nunca lance
  `HttpException` a partir do domínio.

## Padrões de código

- Nomes de domínio em português (`Financiamento`, `Amortizacao`, `SaldoDevedor`) ou inglês —
  escolha um e seja consistente no projeto inteiro. Não misture.
- Nada de `any`. Se precisar, `unknown` + narrowing.
- **Dinheiro nunca em `float`.** Use inteiros em centavos ou `Decimal` do Prisma. Explique a
  escolha e seja consistente em toda a stack, inclusive no schema.
- Funções puras sempre que possível, principalmente no cálculo financeiro.
- Sem números mágicos: taxas, seguros e limites vêm de parâmetros de entrada ou configuração.

## Testes

- **TDD obrigatório no núcleo financeiro.** Teste primeiro, implementação depois. É o diferencial
  visível do projeto.
- Casos de teste devem incluir valores conhecidos verificáveis à mão, bordas (prazo de 1 mês,
  taxa zero, entrada de 100%) e entradas inválidas.
- Cobertura alvo: acima de 80% em `domain/` e `application/`. Não persiga cobertura em
  controllers.
- Testes e2e sobem Postgres via Docker Compose, nunca batem em banco de desenvolvimento.

## Git

- Commits pequenos, atômicos e em **Conventional Commits** (`feat:`, `fix:`, `test:`, `refactor:`,
  `docs:`, `chore:`).
- Mensagens em português ou inglês — consistente.
- **O histórico de commits será lido por recrutadores.** Nada de "wip", "ajustes" ou um commit
  gigante com o projeto inteiro.
- Branch por etapa do roadmap, merge via PR quando fizer sentido demonstrar o fluxo.

## Documentação

Já existem na raiz um `README.md` (versão inicial) e um `docs/decisions.md`. **Ambos são vivos e
devem ser atualizados ao final de cada etapa, nunca no fim do projeto.**

- `README.md` — marcar o checkbox da etapa concluída, atualizar a tabela de endpoints e as seções
  afetadas. Na Etapa 6 ele ganha a versão de vitrine: GIF do Swagger, link do deploy, badge de CI,
  exemplos de requisição e cobertura real de testes.
- `docs/decisions.md` — registro de ADRs. Várias entradas estão com campos `(a preencher)`.
  **Sempre que uma decisão marcada como pendente for tomada durante a implementação, preencha a
  entrada correspondente na hora**, e crie novas entradas para decisões não previstas. Use o
  modelo do fim do arquivo.

Regra dura: o README nunca descreve funcionalidade que não existe. Enquanto algo não estiver
implementado, ele aparece como item não marcado do roadmap.

## O que NÃO fazer

- Não gere código que eu não consiga explicar.
- Não use `any`, `@ts-ignore` ou `eslint-disable` para contornar problema — resolva a causa.
- Não coloque regra de negócio em controller, service do Nest ou repositório.
- Não faça commit de `.env`, credenciais ou dumps de banco.
- Não invente números regulatórios (teto do SFH, taxas de seguro, limite de comprometimento de
  renda). São **parâmetros configuráveis** com valores default documentados como "referência,
  verificar vigência", não fatos hardcoded.

## Roadmap

O escopo completo, a modelagem do banco, os endpoints e as etapas estão em `SPEC.md`.
Leia antes de começar e siga a ordem das etapas.
