# SPEC — Alicerce

API de simulação de financiamento imobiliário. Repositório: `alicerce-api`.

## 1. O problema

Simuladores de financiamento imobiliário dos bancos são caixas-pretas: entregam o valor da
parcela sem mostrar composição, sem permitir comparar sistemas de amortização e sem simular o
efeito de amortizações extraordinárias.

Esta API expõe o cálculo inteiro: tabela de amortização completa, composição de cada parcela
(juros, amortização, seguros, taxa administrativa), comparação entre SAC e Price, custo efetivo
total e o impacto de aportes extras ao longo do contrato.

**Por que este domínio:** regra de negócio real, com aritmética verificável, casos de borda
interessantes e vocabulário de mercado. É exatamente o oposto de um CRUD de tarefas.

---

## 2. Núcleo financeiro

Esta é a parte mais importante do projeto. TypeScript puro, sem dependência de framework, coberta
por testes escritos **antes** da implementação.

### 2.1 Conversão de taxa

A taxa contratada costuma ser anual; o cálculo é mensal. Duas convenções, ambas usadas no mercado:

- **Taxa efetiva equivalente:** `i_m = (1 + i_a)^(1/12) - 1`
- **Taxa nominal linear:** `i_m = i_a / 12`

Implemente as duas, com a convenção como parâmetro de entrada (`rateConvention: 'EFFECTIVE' |
'NOMINAL'`), default efetiva. Documente a diferença no README — saber que existem duas convenções
é um sinal de maturidade.

### 2.2 SAC — Sistema de Amortização Constante

Amortização fixa, parcela decrescente.

```
amortizacao      = principal / n
juros_k          = saldo_devedor_k * i_m
parcela_k        = amortizacao + juros_k
saldo_devedor_k+1 = saldo_devedor_k - amortizacao
```

### 2.3 Price — Sistema Francês

Parcela fixa, amortização crescente.

```
PMT       = PV * [ i * (1+i)^n ] / [ (1+i)^n - 1 ]
juros_k   = saldo_devedor_k * i
amort_k   = PMT - juros_k
saldo_k+1 = saldo_k - amort_k
```

**Caso de borda obrigatório:** quando `i = 0`, a fórmula do PMT divide por zero. Trate
explicitamente (`PMT = PV / n`) e teste.

**Resíduo:** por arredondamento, o saldo final pode não fechar exatamente em zero. Defina uma
política — ajustar a última parcela — documente e teste. Isso é o tipo de detalhe que separa
quem escreveu a fórmula de quem entendeu o problema.

### 2.4 Encargos mensais

Cada parcela real tem mais que juros e amortização:

- **MIP** — seguro de morte e invalidez permanente. Incide sobre o saldo devedor, portanto é
  decrescente. Modele como taxa mensal sobre o saldo.
- **DFI** — seguro de danos físicos ao imóvel. Incide sobre o valor do imóvel, portanto é
  constante.
- **Taxa de administração** — valor fixo mensal.

Todos são parâmetros de entrada com default configurável. **Não hardcode alíquotas como se
fossem fato** — documente como valores de referência.

### 2.5 CET — Custo Efetivo Total

A taxa que iguala o valor presente de todas as parcelas (com encargos) ao montante liberado,
descontadas despesas iniciais. Ou seja: a **TIR** do fluxo de caixa.

Implemente por método numérico — Newton-Raphson com fallback para bissecção, tolerância e limite
de iterações explícitos. Teste com um fluxo de resultado conhecido.

Esta é a peça tecnicamente mais impressionante do projeto. Faça bem e destaque no README.

### 2.6 Amortização extraordinária

Aporte extra em um mês específico, com duas estratégias:

- `REDUCE_TERM` — abate o saldo devedor e encurta o prazo, mantendo a parcela.
- `REDUCE_INSTALLMENT` — abate o saldo e recalcula a parcela para o prazo restante.

A tabela de amortização é recalculada a partir do mês do aporte. O resumo deve mostrar quanto de
juros foi economizado e quantos meses foram eliminados.

### 2.7 Regras de elegibilidade (validação de entrada)

Parâmetros configuráveis, com default documentado como referência de mercado:

- **LTV máximo** — percentual do valor do imóvel que pode ser financiado (entrada mínima).
- **Comprometimento de renda** — parcela inicial não pode exceder um percentual da renda bruta
  familiar informada.
- **Prazo máximo** em meses.
- Valor do imóvel, prazo e taxa positivos; entrada menor que o valor do imóvel.

Cada violação retorna um erro de domínio específico, não uma mensagem genérica.

---

## 3. Modelagem de dados

Prisma + PostgreSQL. Dinheiro em `Decimal` com escala definida, ou inteiro em centavos — escolha
uma abordagem e mantenha em todo o schema.

**User** — id, name, email (único), passwordHash, createdAt, updatedAt

**Simulation** — id, userId (FK), propertyValue, downPayment, termMonths, annualRate,
rateConvention, amortizationSystem (`SAC` | `PRICE`), monthlyIncome (opcional), mipRate, dfiRate,
adminFee, createdAt

**ExtraPayment** — id, simulationId (FK), monthNumber, amount, strategy (`REDUCE_TERM` |
`REDUCE_INSTALLMENT`), createdAt

Sobre a tabela de amortização: **decida se persiste ou calcula sob demanda** e justifique no
README. Recalcular é determinístico e evita dado derivado inconsistente; persistir é mais rápido
na leitura. Um financiamento de 420 meses gera 420 linhas por simulação — isso é um argumento
real. Essa justificativa vale mais numa entrevista que a decisão em si.

Índices: `Simulation.userId`, `ExtraPayment.simulationId`. Cascade delete de simulação para
aportes.

---

## 4. Endpoints

**Autenticação**

- `POST /auth/register`
- `POST /auth/login` — retorna access token e refresh token
- `POST /auth/refresh`
- `GET /me` — protegido

**Simulações** (todas protegidas, escopo do usuário autenticado)

- `POST /simulations` — cria e calcula
- `GET /simulations` — lista paginada do próprio usuário
- `GET /simulations/:id` — resumo
- `GET /simulations/:id/schedule` — tabela de amortização, paginada
- `GET /simulations/:id/summary` — totais, CET, total de juros, comparativo
- `DELETE /simulations/:id`
- `POST /simulations/:id/extra-payments` — adiciona aporte e recalcula
- `POST /simulations/compare` — SAC e Price lado a lado para os mesmos parâmetros

**Público**

- `POST /simulations/preview` — calcula sem persistir e sem autenticação (rate limited)
- `GET /health`

Regras transversais: um usuário nunca acessa simulação de outro (403, não 404 genérico);
paginação em toda listagem; respostas de erro em formato consistente (código, mensagem, detalhes).

---

## 5. Roadmap

Siga na ordem. Cada etapa termina com testes passando, commit limpo e README atualizado.

### Etapa 0 — Fundação
Repositório, TypeScript strict, ESLint + Prettier, Jest, estrutura de pastas, Docker Compose com
Postgres, `.env.example`, README inicial.
**Entrega:** `docker compose up` sobe o banco e `npm test` roda.

### Etapa 1 — Núcleo financeiro (TDD)
Conversão de taxa, SAC, Price, encargos, CET, amortização extraordinária. TypeScript puro, zero
Nest, zero Prisma. Testes escritos antes.
**Entrega:** cobertura acima de 90% no núcleo. Esta é a etapa que define o projeto — não corra.

### Etapa 2 — Domínio e casos de uso
Entidades, value objects, erros de domínio, interfaces de repositório, casos de uso com
repositório em memória (fake) para teste.
**Entrega:** casos de uso testados sem banco.

### Etapa 3 — Persistência
Prisma schema, migrations, implementação dos repositórios, mappers domínio ↔ Prisma.
**Entrega:** testes de integração contra Postgres em container.

### Etapa 4 — Autenticação
Registro, login, hash com argon2 ou bcrypt, JWT com access e refresh, guard, proteção de rotas,
garantia de escopo por usuário.
**Entrega:** teste e2e provando que usuário A não acessa dado de B.

### Etapa 5 — Camada HTTP
Controllers, DTOs com validação, exception filter traduzindo erro de domínio para HTTP,
paginação, rate limiting no endpoint público.
**Entrega:** todos os endpoints funcionando com teste e2e.

### Etapa 6 — Documentação e entrega
Swagger com exemplos reais, README completo, Dockerfile multi-stage, GitHub Actions rodando lint
e testes no PR, deploy em Render ou Railway com Postgres gerenciado.
**Entrega:** link público funcionando e badge de CI verde no README.

### Etapa 7 — Opcional, se sobrar fôlego
Exportação da tabela em CSV ou PDF, cache com Redis nas simulações públicas, histórico de
versões da simulação, healthcheck com status do banco.

---

## 6. Critério de pronto

O projeto está pronto quando um desconhecido consegue, em menos de dez minutos: entender o
problema pelo README, subir a aplicação com um comando, abrir o Swagger e fazer uma simulação
real — e quando o histórico de commits conta a história de como foi construído.

---

## 7. Depois deste projeto

Segundo projeto do portfólio: **API de gestão de carteira de investimentos** — ativos, aportes,
posição consolidada, rentabilidade e integração com API externa de cotações. Demonstra
integração com terceiros, cache e jobs agendados, complementando o que este projeto mostra.

Ao concluir cada etapa, atualizar a seção Projetos do currículo com números concretos: cobertura
de testes, número de endpoints, volume de registros processados na tabela de amortização.
