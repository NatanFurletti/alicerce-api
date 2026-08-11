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

**Decisão.** Suportar **as duas**, com a convenção como parâmetro de entrada
(`rateConvention`) e **efetiva como default**. A efetiva é a convenção coerente com juros
compostos: doze meses da taxa mensal capitalizam de volta exatamente na taxa anual contratada,
propriedade verificada em teste.

**Alternativa descartada.** Adotar só uma. Fixar a nominal simplificaria o código, mas produz uma
taxa mensal maior — 12% a.a. nominal capitaliza em 12,68% a.a. efetivos — e esconderia do usuário
justamente a diferença que o projeto quer expor. Fixar só a efetiva impediria reproduzir contratos
reais que usam a linear.

**Custo assumido.** Um parâmetro a mais em toda a superfície da API, e a obrigação de documentar a
diferença — do contrário o usuário compara duas simulações que não são comparáveis. É um custo de
clareza, e clareza é o produto aqui.

---

## ADR-009 — Política do resíduo de arredondamento na tabela de amortização

**Contexto.** Trabalhando em centavos inteiros (ADR-002), nem `principal / n` (SAC) nem o PMT
(Price) resultam em valores exatos. Sem uma política, o saldo devedor não fecha em zero — o
defeito clássico do simulador que termina com R$ 0,03 em aberto.

**Decisão.** **Fechar na última parcela.** No SAC, a divisão inteira é feita uma vez e o resto é
somado à última amortização. No Price, a amortização do último mês é *definida* como o saldo de
abertura remanescente, e a prestação daquele mês é recomposta a partir dela. O saldo termina em
zero por construção, não por sorte.

**Alternativa descartada.** Distribuir o resíduo centavo a centavo pelas primeiras parcelas.
Nenhuma parcela destoaria mais que um centavo, mas no SAC as amortizações deixariam de ser
idênticas — num sistema cujo nome é "amortização constante". Descartada por contradizer o modelo
que a tabela deveria comunicar.

**Custo assumido.** A última parcela difere das demais. E o desvio **não é de centavos**: num
contrato de R$ 400 mil em 360 meses, arredondar o PMT em até meio centavo por mês e deixar esse
desvio render juros acumula cerca de **R$ 13,00** na parcela final — 0,32% dela. Isso é o custo
real da aritmética inteira, não um defeito, e por isso o teste correspondente afirma um limite
*relativo* (< 1% do PMT) em vez de um limite absoluto em centavos.

---

## ADR-010 — Base de cálculo do MIP

**Contexto.** O MIP incide sobre o saldo devedor, mas "saldo devedor do mês k" é ambíguo: pode ser
o saldo de abertura, antes do pagamento, ou o de fechamento, após a amortização.

**Decisão.** **Saldo de abertura** — a mesma base usada para os juros do mês. Manter juros e
seguro olhando para o mesmo saldo evita a incoerência de duas linhas da mesma parcela calculadas
sobre bases diferentes.

**Alternativa descartada.** Saldo após a amortização, sob o argumento de que o seguro cobre o
risco remanescente. Descartada pela inconsistência com os juros e por um efeito colateral
esquisito: na última parcela o saldo é zero, logo o MIP seria zero — o mutuário ficaria descoberto
justamente no mês final.

**Custo assumido.** A última parcela ainda cobra MIP sobre o saldo que está sendo quitado.
Defensável (a cobertura vale pelo mês inteiro), mas é uma pergunta que aparece.

---

## ADR-011 — Tolerância do VPL e largura do intervalo são grandezas distintas no CET

**Contexto.** A bissecção do cálculo da TIR tem dois critérios de parada possíveis: o VPL ficou
próximo de zero, ou o intervalo de busca ficou estreito demais para continuar. A primeira
implementação usou a **mesma** tolerância (`1e-9`) para os dois.

**Decisão.** Separar as duas constantes. A tolerância do VPL segue em `1e-9` (unidades
monetárias); a largura mínima do intervalo passa a ser `1e-15` (unidades de taxa), o limite
prático de resolução de um `double` nessa faixa. São ~51 iterações para estreitar de `[-0.9999, 1]`
até lá, dentro do teto de 100.

**Alternativa descartada.** Manter um único parâmetro, por simplicidade. Descartada porque estava
**errado**: um teste de fallback expôs uma TIR devolvida com VPL residual de `-5,1e-5` — a
bissecção parava por largura de intervalo enquanto o VPL ainda não havia convergido. Tolerância em
reais e largura em taxa não são comparáveis, e tratá-las como se fossem produz uma resposta
plausível e errada.

**Custo assumido.** Mais um parâmetro interno para explicar. Em compensação, o método passou a ser
verificado por invariante — `VPL(TIR) ≈ 0` — e não por inspeção visual do resultado.

---

## ADR-012 — Saneamento de ruído numérico na taxa do CET

**Contexto.** Num contrato sem juros e sem encargos, a TIR é exatamente zero. O método numérico,
porém, devolve algo como `-2,18e-17`. Esse "zero negativo" era propagado adiante e fazia a
anualização — que rejeita taxa negativa — lançar erro num caso perfeitamente válido.

**Decisão.** Colapsar em zero exato qualquer taxa cujo valor absoluto seja menor que `1e-12`
(`RATE_NOISE_FLOOR`). Dez ordens de grandeza abaixo de um centésimo de ponto-base: nenhuma taxa
real vive nessa faixa, então o saneamento não pode mascarar um resultado legítimo.

**Alternativa descartada.** Relaxar a validação de `monthlyToAnnualRate` para aceitar taxas
levemente negativas. Descartada por tratar o sintoma no lugar errado: a validação está correta em
rejeitar taxa negativa, e o ruído deve ser eliminado onde nasce — na saída do método numérico.

**Custo assumido.** Uma constante mágica a mais, ainda que documentada e justificada. E TIRs
genuinamente minúsculas seriam arredondadas para zero — irrelevante no domínio, mas é uma
suposição sobre o domínio embutida no código numérico.

---

## ADR-005 — Método numérico para o cálculo do CET

**Contexto.** O CET é a TIR do fluxo de caixa e não tem solução fechada. Exige método iterativo.

**Decisão.** **Newton-Raphson com fallback para bissecção.** Newton converge quadraticamente — 4
ou 5 iterações no caso típico — mas depende da derivada do VPL: se ela degenera ou o passo sai do
intervalo válido, o método é abandonado e a bissecção assume. A bissecção é linear, portanto
lenta, mas infalível enquanto houver troca de sinal no intervalo.

Parâmetros explícitos: tolerância do VPL `1e-9`, máximo de 100 iterações, intervalo de busca
`[-99,99%, 100%]` ao mês. **Quando não converge, lança `CetDidNotConvergeError`** — nunca devolve
`NaN` disfarçado de taxa. O fluxo é validado antes: sem ao menos uma entrada e uma saída, não há
raiz a procurar (regra de sinal de Descartes).

**Alternativa descartada.** Só bissecção, que é mais simples e sempre converge: descartada pelo
número de iterações, que importa quando o CET é recalculado a cada leitura (ADR-003). Só Newton:
descartada por poder divergir sem aviso, devolvendo um número plausível e errado — o pior modo de
falha possível num cálculo financeiro.

**Custo assumido.** Dois métodos para manter e testar, e um espaço de estados maior — os testes
precisam forçar o caminho do fallback de propósito (chute inicial absurdo) para cobri-lo. Ver
também [ADR-011](#adr-011--tolerância-do-vpl-e-largura-do-intervalo-são-grandezas-distintas-no-cet)
e [ADR-012](#adr-012--saneamento-de-ruído-numérico-na-taxa-do-cet), ambas nascidas de defeitos
reais encontrados durante os testes deste método.

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

## ADR-013 — Erros de domínio como exceção, não como `Result`

**Contexto.** O CLAUDE.md menciona um `Result`/`Either` em `shared/`. Casos de uso precisam
sinalizar falha de regra de negócio — LTV estourado, simulação de outro usuário — e há duas formas:
lançar exceção ou devolver o erro como valor.

**Decisão.** **Exceções de domínio.** Casos de uso lançam `DomainError`; o exception filter da
Etapa 5 traduz para HTTP via `instanceof`. É o caminho idiomático do NestJS, mantém o código
linear (sem desembrulhar retorno a cada chamada) e é consistente com o núcleo financeiro, que já
funciona assim desde a Etapa 1.

**Alternativa descartada.** `Result<T, E>` como valor de retorno. A vantagem real é o compilador
cobrar o tratamento do erro — com exceção, esquecer o `catch` compila. Descartada porque exigiria
reescrever o núcleo já pronto e testado, e porque em NestJS o filtro global já garante que nenhuma
exceção escapa sem virar resposta HTTP estruturada: o "esquecimento" tem uma rede embaixo.

**Custo assumido.** O tipo de retorno de um caso de uso não revela quais erros ele pode produzir —
isso vive na documentação e nos testes, não na assinatura. Mitigação parcial: todo erro tem `code`
estável, e o Swagger da Etapa 6 vai listar os códigos possíveis por endpoint.

---

## ADR-014 — Regras de elegibilidade como política injetada

**Contexto.** LTV máximo, comprometimento de renda e prazo máximo variam por instituição, por
programa e ao longo do tempo. O CLAUDE.md proíbe tratá-los como fatos regulatórios hardcoded.

**Decisão.** Um objeto `EligibilityPolicy` é passado ao caso de uso, que o repassa a
`Simulation.create`. Os defaults vêm de configuração (`.env`), e o domínio **valida contra a
política que recebe** — nunca lê `process.env` nem decide qual é o limite.

**Alternativa descartada.** Constantes no domínio com override opcional. Menos fiação, mas
colocaria números de mercado dentro de `domain/` exatamente como o CLAUDE.md proíbe — e um default
embutido no código é lido como verdade por quem passa depois.

**Custo assumido.** Mais um parâmetro em construtores e assinaturas, e a política precisa ser
montada na fiação da aplicação. Em troca, cada teste declara a política que exercita, e mudar o
LTV máximo em produção é configuração, não deploy de código.

---

## ADR-015 — Recurso inexistente e recurso alheio produzem o mesmo erro

**Contexto.** O SPEC pede que um usuário nunca acesse simulação de outro, sugerindo 403. Mas
responder 403 para "existe e é de outro" e 404 para "não existe" revela quais ids existem.

**Decisão.** Um único `SimulationNotFoundError` para os dois casos, traduzido para **404**. Do
ponto de vista de quem pergunta, um recurso que ele não pode ver não existe.

A garantia é estrutural, não disciplinar: o repositório expõe `findByIdAndUserId(id, userId)` e
**não** `findById`. O dono é argumento obrigatório, então não há como escrever a consulta sem o
escopo. Um helper único (`findOwnedSimulation`) concentra a verificação, e um arquivo de teste
dedicado exercita todos os casos de uso que operam sobre simulação existente.

**Alternativa descartada.** 403 para recurso alheio, que é mais literal em relação ao SPEC e mais
informativo para quem depura. Descartada porque a diferença de status é um oráculo de enumeração:
um atacante varre ids e mapeia quais existem.

**Custo assumido.** Desvia do 403 literal do SPEC, e um usuário que realmente perdeu acesso a algo
seu receberia "não encontrado" em vez de uma mensagem mais precisa. Trade-off consciente a favor
de não vazar existência.

---

## ADR-016 — Tempo e identificadores como portas injetadas

**Contexto.** Casos de uso precisam de `new Date()` e de gerar ids. Chamados diretamente, tornam o
resultado não determinístico e o teste dependente do relógio da máquina.

**Decisão.** Duas portas — `Clock` e `IdGenerator` — com implementação de produção (`SystemClock`,
`UuidGenerator`) e de teste (`FixedClock`, `SequentialIdGenerator`).

O id é gerado **pela aplicação, não pelo banco**. Com sequência do Postgres, a entidade só teria
identidade depois do `INSERT`, obrigando a construir um objeto incompleto e preenchê-lo depois.
Gerando antes, a entidade nasce válida e o repositório vira detalhe de armazenamento. `randomUUID`
usa o CSPRNG do sistema, então ids não são enumeráveis — relevante num recurso escopado por
usuário.

**Alternativa descartada.** Chamar `new Date()` e deixar o banco gerar o id. Mais simples e
suficiente para o caminho feliz. Descartada porque inviabiliza testar datas de forma determinística
e porque ids sequenciais expostos numa URL permitem inferir volume e enumerar recursos.

**Custo assumido.** Duas abstrações a mais e um pouco de cerimônia na fiação. UUID como chave
primária também é mais largo que um `bigint` e tem localidade de índice pior — irrelevante nesta
escala, mas é o argumento honesto contra.

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
