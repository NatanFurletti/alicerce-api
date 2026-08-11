# Registro de decisões técnicas — Alicerce

Cada decisão relevante do projeto registrada em três blocos: **contexto**, **decisão** e
**alternativa descartada**.

Por que este arquivo existe: o "o quê" está no código, mas o "por quê" evapora em poucas semanas.
É justamente o porquê que aparece em entrevista técnica. Registre no momento da decisão, não
depois.

**Formato:** copie o modelo do fim do arquivo. Uma entrada por decisão, numeradas em ordem
cronológica, sem reescrever entradas antigas — se você mudar de ideia, adicione uma nova entrada
que supersede a anterior. O histórico de mudança de opinião é um bom sinal, não um defeito.

---

## ADR-001 — Clean Architecture com domínio isolado de framework

**Contexto.** O núcleo do projeto é matemática financeira: SAC, Price, CET, amortização
extraordinária. Essa lógica precisa ser exaustivamente testada e não tem nenhuma relação com HTTP
ou com banco de dados.

**Decisão.** Separar `domain/`, `application/` e `infra/`, com o domínio em TypeScript puro, sem
importar nada de `@nestjs/*` ou `@prisma/client`. Casos de uso dependem de interfaces de
repositório, não de implementações.

**Alternativa descartada.** Estrutura padrão do NestJS (module / controller / service), com a
regra de negócio nos services. Descartada porque acopla o cálculo financeiro ao framework, torna
o teste unitário mais lento e caro, e não demonstra entendimento de arquitetura — que é um dos
objetivos deste projeto.

**Custo assumido.** Mais arquivos, mais mapeamento entre camadas e mais cerimônia para um CRUD
simples. Aceitável porque o valor do projeto está na regra de negócio, não no CRUD.

---

## ADR-002 — Representação monetária

**Contexto.** Um financiamento de 420 meses acumula erro de arredondamento a cada parcela. Erro
em cálculo financeiro não é detalhe estético.

**Decisão.** **Inteiros em centavos** em toda a stack. No núcleo financeiro, `number` contendo
sempre um inteiro (tipo nominal `Cents` em `src/shared/money.ts`); no Postgres, `BigInt`. A
exatidão vem de nunca sair do domínio dos inteiros — `number` representa inteiros exatamente até
2^53-1, o equivalente a ~90 trilhões de reais em centavos, folga enorme para o domínio.

Duas políticas derivam disso e estão implementadas e testadas em `money.ts`:

- **Arredondamento:** half-up sobre o valor absoluto, aplicado a cada parcela individualmente
  (`multiplyByRate`). Simétrico em torno do zero — `Math.round` sozinho não serve, porque em
  JavaScript ele arredonda para +infinito e trata -0.5 como -0.
- **Resíduo:** `divideCents` devolve a parcela base **e** o resto explicitamente, em vez de
  escondê-lo. A política do projeto é absorver o resíduo na última parcela, garantindo que a soma
  das amortizações feche exatamente no principal e o saldo devedor termine em zero.

**Alternativa descartada.** `number` em reais (IEEE 754 double). Descartada porque ponto flutuante
binário não representa exatamente valores decimais, e o erro se acumula ao longo de centenas de
parcelas.

Também descartado `Decimal` (Prisma / decimal.js): resolveria a exatidão, mas introduz uma
dependência dentro do domínio, que a ADR-001 quer em TypeScript puro, e troca aritmética nativa
por chamadas `.plus()` / `.times()` em código que precisa ser legível como fórmula financeira.

**Custo assumido.** Toda borda de entrada e saída precisa converter reais ↔ centavos
explicitamente, e esquecer uma conversão erra por um fator de 100. Mitigado por `assertCents`, que
falha alto se um valor fracionário vazar para o cálculo. Taxas de juros continuam sendo `number`
fracionário — são fatores, não dinheiro, e o arredondamento acontece no produto.

---

## ADR-003 — Persistir ou recalcular a tabela de amortização

**Contexto.** Cada simulação gera uma linha por mês. Um contrato de 35 anos são 420 linhas por
simulação. O cálculo é determinístico: mesmos parâmetros, mesmo resultado.

**Decisão.** **Recalcular sob demanda.** O banco persiste apenas os parâmetros da simulação (uma
linha) e os aportes extraordinários. `GET /simulations/:id/schedule` recomputa a tabela a partir
deles e pagina o resultado em memória.

O argumento decisivo é que a tabela é **dado derivado**: mesmos parâmetros produzem sempre o mesmo
resultado, porque o núcleo é composto de funções puras. Dado derivado persistido pode divergir da
fórmula que o gerou — basta corrigir um arredondamento na Etapa 1 para que toda simulação anterior
passe a carregar números que o código atual não reproduz mais. Recalcular torna essa classe de
inconsistência impossível por construção.

**Alternativa descartada.** Persistir as 420 linhas na criação da simulação. Tornaria a leitura e
a paginação um `SELECT ... LIMIT/OFFSET` trivial e transferiria o custo do cálculo para a escrita,
que acontece uma vez só. Descartada por dois motivos: (a) o risco de dado derivado inconsistente
acima; (b) cada aporte extraordinário recalcula a tabela a partir do mês do aporte, o que exigiria
reescrever centenas de linhas a cada `POST /extra-payments` — uma operação de escrita cara para
resolver um problema de leitura que ainda não existe.

**Custo assumido.** CPU a cada leitura: 420 iterações de aritmética inteira por requisição, o que
é da ordem de microssegundos, mas escala linearmente com o tráfego em vez de ser pago uma vez. Se
isso virar gargalo real, o caminho é cache (Redis, Etapa 7) com os parâmetros como chave —
justamente o que o determinismo do cálculo torna seguro. Otimizar antes de medir seria
prematuro.

---

## ADR-004 — Convenção de conversão de taxa anual para mensal

**Contexto.** A taxa é contratada ao ano, o cálculo é mensal, e o mercado usa duas convenções
diferentes: taxa efetiva equivalente `(1+i)^(1/12)-1` e taxa nominal linear `i/12`. Elas produzem
parcelas diferentes para a mesma taxa contratada.

**Decisão.** _(a preencher — suportar ambas via parâmetro de entrada e definir qual é o default)_

**Alternativa descartada.** _(a preencher)_

---

## ADR-005 — Método numérico para o cálculo do CET

**Contexto.** O CET é a TIR do fluxo de caixa e não tem solução fechada. Exige método iterativo.

**Decisão.** _(a preencher — Newton-Raphson com fallback para bissecção; registrar tolerância,
limite de iterações e o que acontece quando não converge)_

**Alternativa descartada.** _(a preencher)_

---

## ADR-006 — Estratégia de autenticação

**Contexto.** _(a preencher)_

**Decisão.** _(a preencher — algoritmo de hash, tempo de vida do access token, estratégia de
refresh e onde o refresh token é armazenado)_

**Alternativa descartada.** _(a preencher)_

---

## ADR-007 — class-validator para DTOs HTTP, função pura para variáveis de ambiente

**Contexto.** O projeto precisa validar dois tipos de entrada muito diferentes: payloads HTTP, que
chegam em toda requisição e precisam aparecer no Swagger, e variáveis de ambiente, lidas uma única
vez antes de o framework existir.

**Decisão.** **class-validator + class-transformer** nos DTOs, via `ValidationPipe` global, porque
`@nestjs/swagger` deriva o schema OpenAPI dos mesmos decorators — uma única declaração vira
validação e documentação, e a Etapa 6 exige Swagger com exemplos reais.

Para as variáveis de ambiente, **uma função pura** (`src/shared/config/env.ts`), sem decorators. O
`loadEnv` roda no boot, falha rápido listando **todas** as variáveis inválidas de uma vez e não
depende de `reflect-metadata` nem de container de DI.

**Alternativa descartada.** Zod nos dois casos. Tem tipagem inferida (`z.infer`), dispensando a
duplicação entre tipo e validação que os decorators criam. Descartada porque integrar com o
Swagger exigiria `nestjs-zod` — mais uma dependência — e class-validator é o caminho idiomático do
NestJS, que é o framework escolhido.

**Custo assumido.** O tipo do DTO e suas regras de validação vivem em declarações separadas e
podem divergir sem que o compilador perceba: um campo pode existir na classe sem nenhum decorator
e passar direto pela validação. Mitigação: `forbidNonWhitelisted: true` no `ValidationPipe`
(Etapa 5), que rejeita qualquer propriedade não decorada em vez de ignorá-la silenciosamente.

---

## ADR-008 — Fronteiras da arquitetura garantidas por lint, não por convenção

**Contexto.** A ADR-001 define que `domain/` não importa framework nem ORM. Escrita apenas em
documentação, essa regra depende de disciplina e é violada no primeiro atalho conveniente — e uma
violação silenciosa desfaz o principal argumento arquitetural do projeto.

**Decisão.** Codificar a regra como `no-restricted-imports` por pasta no ESLint: importar
`@nestjs/*`, `@prisma/client` ou qualquer caminho de `infra/` dentro de `src/domain/` é **erro de
lint**, e a mesma restrição, sem o `@nestjs/*`, vale para `src/application/`. O CI roda o lint,
então a violação quebra o PR.

**Alternativa descartada.** `eslint-plugin-boundaries` ou `dependency-cruiser`, que expressam
grafos de dependência mais ricos e geram diagramas. Descartados por ora: uma dependência a mais
para o que quinze linhas de configuração nativa já resolvem neste número de camadas.

**Custo assumido.** A regra é baseada em padrão de caminho, não em análise real do grafo de
dependências: ela não detecta um ciclo indireto (`domain` → `shared` → `infra`). Se as camadas
crescerem, migrar para dependency-cruiser é o próximo passo.

---

## Modelo para novas entradas

```markdown
## ADR-00X — Título curto e afirmativo

**Contexto.** Qual problema apareceu e quais restrições existiam.

**Decisão.** O que foi escolhido, em uma ou duas frases diretas.

**Alternativa descartada.** O que foi considerado e por que não foi adotado.

**Custo assumido.** O que essa escolha piora. Toda decisão tem um lado ruim — reconhecê-lo é o
que separa decisão de preferência.
```
