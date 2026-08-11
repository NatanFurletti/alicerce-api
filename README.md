# Alicerce

> API de simulação de financiamento imobiliário com SAC, Price, CET e amortização
> extraordinária.

**Status:** em construção — Etapa 1 de 7 (fundação concluída). Veja o [roadmap](#roadmap).

---

## O problema

Os simuladores de financiamento dos bancos são caixas-pretas. Eles informam o valor da parcela,
mas não mostram como ela é composta, não permitem comparar sistemas de amortização e não
simulam o efeito de aportes extras ao longo do contrato.

A Alicerce expõe o cálculo inteiro:

- Tabela de amortização completa, mês a mês
- Composição de cada parcela: juros, amortização, seguros MIP e DFI, taxa administrativa
- Comparação direta entre **SAC** e **Tabela Price** para os mesmos parâmetros
- **CET** (Custo Efetivo Total) calculado como TIR do fluxo de caixa, por método numérico
- Simulação de **amortização extraordinária**, com redução de prazo ou de parcela, mostrando
  juros economizados

---

## Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js LTS |
| Linguagem | TypeScript (`strict`) |
| Framework | NestJS |
| Banco de dados | PostgreSQL |
| ORM | Prisma |
| Testes | Jest |
| Documentação | Swagger / OpenAPI |
| Containerização | Docker + Docker Compose |
| CI | GitHub Actions |

---

## Arquitetura

Clean Architecture pragmática. A regra central: **o domínio não conhece framework nem banco de
dados.**

```
src/
  domain/          entidades, value objects, erros de domínio, interfaces de repositório
  application/     casos de uso e DTOs
  infra/
    database/      Prisma, repositórios, mappers
    http/          controllers, guards, exception filters
    auth/          JWT e hashing
  shared/          utilitários e tipos comuns
```

O núcleo de cálculo financeiro é **TypeScript puro**, sem nenhuma dependência de NestJS ou
Prisma, e é testado isoladamente. Essa separação é o que permite escrever os testes primeiro e
rodar toda a matemática do domínio sem subir infraestrutura.

As fronteiras entre camadas não são só convenção: importar `@nestjs/*` ou `@prisma/client` dentro
de `src/domain/` é **erro de ESLint** e quebra o CI. Uma regra de arquitetura que existe apenas na
documentação é uma regra que será violada.

As decisões técnicas e as alternativas descartadas estão registradas em
[`docs/decisions.md`](docs/decisions.md).

---

## Dinheiro nunca é `float`

Um financiamento de 420 meses acumula erro de arredondamento a cada parcela. Em ponto flutuante
binário `0.1 + 0.2 !== 0.3`, e esse desvio se propaga até o saldo devedor não fechar em zero.

Todo valor monetário no projeto é **inteiro de centavos**, do cálculo ao banco. Duas políticas
explícitas, implementadas e testadas em [`src/shared/money.ts`](src/shared/money.ts):

- **Arredondamento half-up simétrico** em torno do zero, aplicado parcela a parcela. `Math.round`
  sozinho não serve: em JavaScript ele arredonda em direção a +infinito, tratando `-0.5` como `-0`.
- **Resíduo explícito.** Dividir R$ 100,00 em 3 parcelas deixa 1 centavo sobrando. `divideCents`
  devolve esse resto em vez de escondê-lo, e a política do projeto é absorvê-lo na última parcela,
  para que a soma feche exatamente no principal.

O raciocínio completo, com as alternativas descartadas, está na
[ADR-002](docs/decisions.md#adr-002--representação-monetária).

---

## Roadmap

- [x] **Etapa 0** — Fundação: TypeScript strict, ESLint, Prettier, Jest, Docker Compose com Postgres, CI
- [ ] **Etapa 1** — Núcleo financeiro em TDD: SAC, Price, encargos, CET, aporte extraordinário
- [ ] **Etapa 2** — Domínio e casos de uso com repositórios em memória
- [ ] **Etapa 3** — Persistência: Prisma, migrations, repositórios e testes de integração
- [ ] **Etapa 4** — Autenticação JWT com access e refresh token
- [ ] **Etapa 5** — Camada HTTP: controllers, validação, paginação, tratamento de erros
- [ ] **Etapa 6** — Swagger, Dockerfile multi-stage, CI e deploy
- [ ] **Etapa 7** — Extras: exportação CSV, cache, histórico de simulações

Itens não marcados **não estão implementados**.

---

## Como rodar

Pré-requisitos: Docker e Node.js 20 LTS.

```bash
git clone https://github.com/NatanFurletti/alicerce-api.git
cd alicerce-api
cp .env.example .env
docker compose up -d     # sobe Postgres (dev :5432 e teste :5433)
npm install
npm run start:dev
```

A aplicação sobe em `http://localhost:3000`. O único endpoint disponível hoje é
`GET /health` — os demais entram a partir da Etapa 5, e o Swagger na Etapa 6.

```bash
curl http://localhost:3000/health
# {"status":"ok","uptimeSeconds":3,"timestamp":"..."}
```

### Testes

```bash
npm test              # unitários
npm run test:cov      # relatório de cobertura
npm run test:e2e      # end-to-end
npm run lint          # ESLint, inclui as regras de fronteira entre camadas
npm run typecheck     # tsc --noEmit
```

### Bancos de dados

O Compose sobe **dois** containers Postgres 16:

| Container | Porta | Banco | Persistência |
|---|---|---|---|
| `alicerce-postgres` | 5432 | `alicerce` | volume nomeado |
| `alicerce-postgres-test` | 5433 | `alicerce_test` | `tmpfs` — some ao parar |

A separação é física, não por convenção: um teste e2e não tem como escrever no banco de
desenvolvimento porque aponta para outra porta e outro container. O banco de teste vive em
memória, o que o torna rápido e descartável.

---

## Endpoints

> Serão documentados conforme forem implementados. A referência completa fica no Swagger.

| Método | Rota | Descrição | Status |
|---|---|---|---|
| POST | `/auth/register` | Cadastro de usuário | pendente |
| POST | `/auth/login` | Autenticação | pendente |
| POST | `/simulations` | Cria e calcula uma simulação | pendente |
| GET | `/simulations/:id/schedule` | Tabela de amortização paginada | pendente |
| GET | `/simulations/:id/summary` | Totais, CET e comparativo | pendente |
| POST | `/simulations/:id/extra-payments` | Aporte extraordinário | pendente |
| POST | `/simulations/compare` | SAC e Price lado a lado | pendente |
| POST | `/simulations/preview` | Cálculo público, sem persistir | pendente |

---

## Nota sobre parâmetros de mercado

Alíquotas de seguro, limites de comprometimento de renda, LTV máximo e prazo máximo são
**parâmetros configuráveis**, com valores default apenas de referência. Não constituem
recomendação financeira nem refletem necessariamente as regras vigentes de nenhuma instituição.
Confira as condições reais junto ao agente financeiro.

---

## Autor

**Natan Furletti** — desenvolvedor backend

[LinkedIn](https://www.linkedin.com/in/natan-furletti/) · [GitHub](https://github.com/NatanFurletti)

Atuei três anos com crédito imobiliário e financiamento habitacional antes de migrar para
desenvolvimento. Este projeto nasceu de um problema que eu via todo dia: cliente assinando um
contrato de trinta anos sem entender a composição da própria parcela.
