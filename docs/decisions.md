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

**Contexto.** A API é escopada por usuário: cada simulação pertence a alguém, e a regra transversal
é que ninguém acessa dado de outro. Isso exige identificar quem chama em toda requisição.

**Decisão.**

**Hash: bcrypt com custo 12.** Cada incremento dobra o tempo de cálculo; 12 leva ~250-300ms, lento
o bastante para inviabilizar força bruta em massa e rápido o bastante para não travar um login. O
custo fica embutido no hash, então elevá-lo no futuro não invalida as senhas já cadastradas.

Senhas acima de **72 bytes são rejeitadas**, não truncadas. O bcrypt ignora silenciosamente o que
passa disso — verifiquei: uma senha de 72 caracteres + sufixo autentica com o sufixo trocado por
qualquer outro, ou por nenhum. Sem essa guarda, o usuário acharia que tem uma senha mais forte do
que tem. A contagem é em **bytes**, não caracteres: `á` ocupa 2, emoji chegam a 4.

**Tokens: JWT, access de 15 minutos e refresh de 7 dias**, com **segredos distintos**. Não é
redundância: o segredo de access circula em muito mais requisições, e se vazar o atacante ainda
não forja refresh tokens. O payload carrega um campo `type`, verificado além da assinatura — sem
ele, um refresh token de 7 dias seria aceito como credencial de acesso.

**O refresh token é stateless**, sem persistência.

**Alternativa descartada.** argon2id, que é a recomendação atual da OWASP e resiste melhor a ataque
por GPU porque exige memória além de CPU. Descartado pela dependência nativa (node-gyp), que
complicaria a imagem Docker da Etapa 6. bcrypt continua adequado com custo apropriado.

Também descartado o refresh token persistido com rotação e detecção de reuso.

**Custo assumido — e este é grave o suficiente para ser declarado sem rodeios.** Com refresh
stateless **não existe revogação**:

- **Não há rota de logout** que funcione de verdade. Descartar o token no cliente não o invalida.
- **Um refresh token roubado vale até expirar** — até 7 dias — e não há como cortá-lo.
- **Não é possível "sair de todos os dispositivos"** nem responder a um incidente invalidando
  sessões.

O que limita o dano é a vida curta do access token (15 min) e a verificação, a cada refresh, de que
o usuário ainda existe — uma conta apagada deixa de renovar. O README **não promete** logout, e
nenhuma rota desse tipo foi implementada: prometer e não entregar seria pior que a limitação.

Se o projeto precisar de revogação, o caminho mais barato é uma coluna `token_version` em `users`,
incluída no payload: incrementá-la invalida todos os refresh tokens daquele usuário de uma vez, ao
custo de uma leitura que o refresh já faz.

---

## ADR-021 — Guard global com exceções explícitas

**Contexto.** As rotas protegidas são a maioria; as públicas são `/health` e o preview de
simulação. Há duas formas de aplicar o guard: rota a rota, ou globalmente com exceções marcadas.

**Decisão.** Guard **global** via `APP_GUARD`, com `@Public()` marcando as exceções.

O argumento é o modo de falha. Protegendo rota a rota, esquecer o decorator num endpoint novo o
deixa **aberto** — falha silenciosa, e ninguém nota até vazar. Com guard global, esquecer o
`@Public()` **quebra o endpoint** de forma imediata e visível. Entre duas formas de errar, escolhe-
se a que grita.

**Alternativa descartada.** `@UseGuards(JwtAuthGuard)` por controller. Mais explícito na leitura de
cada arquivo, e não exige lembrar que existe um guard global. Descartada pelo modo de falha acima.

**Custo assumido.** Um leitor que abre só o controller não vê que a rota está protegida — a
informação está no módulo. E toda rota pública nova exige um decorator a mais. Aceitável: o custo é
de legibilidade, e o da alternativa é de segurança.

---

## ADR-022 — Falhas de autenticação são indistinguíveis entre si

**Contexto.** Um endpoint de login pode falhar por e-mail inexistente, senha errada ou e-mail
malformado. Um endpoint protegido pode recusar por token ausente, expirado, com assinatura
inválida ou do tipo errado.

**Decisão.** Cada grupo produz **uma única resposta**: `InvalidCredentialsError` no login,
**401 com corpo genérico** nas rotas protegidas. A mensagem nunca diz qual foi o motivo.

Mais sutil, e igualmente necessário: o login **verifica a senha mesmo quando o e-mail não existe**,
contra um hash descartável. Sem isso, "e-mail inexistente" responderia em microssegundos e "senha
errada" levaria os ~300ms do bcrypt — diferença facilmente mensurável, que transforma o endpoint
num oráculo de quais e-mails têm conta. **Igualar as mensagens sem igualar o tempo resolve só
metade do problema.**

**Alternativa descartada.** Mensagens específicas ("e-mail não cadastrado"), que são muito melhores
de usar. Descartadas porque permitem enumerar a base de usuários — primeiro passo de credential
stuffing. O ganho de UX não compensa entregar a lista de e-mails cadastrados.

**Custo assumido.** Pior experiência para o usuário legítimo, que não sabe se errou o e-mail ou a
senha. E o hash descartável gasta CPU numa requisição que já se sabe que vai falhar — inclusive
sob ataque de força bruta, o que é um vetor de DoS. Mitigado pelo rate limiting da Etapa 5.

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

## ADR-017 — Isolamento dos testes de integração por TRUNCATE

**Contexto.** Testes contra Postgres precisam começar de um estado conhecido. Duas abordagens
usuais: truncar as tabelas entre casos, ou rodar cada caso dentro de uma transação revertida.

**Decisão.** `TRUNCATE ... RESTART IDENTITY CASCADE` num único comando, antes de cada teste. O
`CASCADE` respeita as chaves estrangeiras sem exigir ordem de deleção. Roda contra o container de
teste na porta 5433, com dados em `tmpfs`.

**Alternativa descartada.** Transação com rollback, que é mais rápida. Descartada por dois motivos:
o código sob teste não poderia usar transações próprias sem recorrer a savepoints — e o
`listByUserId` já usa `$transaction` —, e nenhum teste exercitaria um `COMMIT` real. Um bug que só
aparece no commit (constraint deferida, trigger) passaria despercebido.

**Custo assumido.** Mais lento que rollback, e impede paralelizar suítes contra o mesmo banco. O
e2e já roda com `--runInBand`, e o banco em `tmpfs` mantém o custo irrelevante: 37 testes em ~3s.

---

## ADR-018 — Teste de contrato compartilhado entre fake e Prisma

**Contexto.** Os casos de uso da Etapa 2 são testados contra repositórios em memória. Isso os
torna rápidos e independentes de Docker, mas cria um risco concreto: se o fake ordena por data
decrescente e a implementação Prisma esquecer o `orderBy`, os 259 testes continuam verdes e a
produção quebra. O fake mentiria sobre o contrato.

**Decisão.** Uma suíte única (`test/contracts/simulation-repository.contract.ts`) escrita contra a
**interface**, executada contra as duas implementações: na suíte unitária para o fake, na e2e para
o Prisma. Toda garantia que um caso de uso assume — escopo por usuário, ordenação, semântica de
paginação, fidelidade do mapper — vira um caso ali.

Os fixtures inserem **fora de ordem** de propósito: um teste de ordenação cujo fixture já está
ordenado passa por coincidência, mesmo sem `ORDER BY`.

**Verificação de que funciona.** Removi o `orderBy` do repositório Prisma: dois casos do contrato
falharam contra o Postgres. Com o fake sozinho, o mesmo bug passaria despercebido.

**Alternativa descartada.** Testar cada implementação por conta própria. Mais liberdade para cobrir
particularidades, mas nada garantiria que as duas concordam — que é exatamente a propriedade em
jogo.

**Custo assumido.** O contrato precisa ser genérico o bastante para as duas, então detalhes
específicos do Postgres (comportamento de `bigint`, timezone) ficam em testes de integração
separados. E ids de teste tiveram que virar UUID determinístico, já que o schema usa `@db.Uuid`.

---

## ADR-019 — Unicidade de e-mail garantida pelo banco, não pelo caso de uso

**Contexto.** `RegisterUserUseCase` consulta `findByEmail` antes de criar. Entre essa consulta e o
`INSERT` existe uma janela — TOCTOU — e ela é larga justamente porque o hash da senha é
deliberadamente lento.

**Decisão.** Manter a checagem prévia **e** traduzir o erro `P2002` do Prisma para
`EmailAlreadyInUseError` no repositório. A constraint `UNIQUE` é a garantia real, porque
verificação e escrita são atômicas dentro do banco; a checagem prévia serve para mensagem amigável
e para evitar o custo do argon2 no caso comum. As duas rotas produzem o mesmo erro de domínio.

**Verificação de que era um problema real.** Com um hasher lento simulando argon2, duas requisições
concorrentes ao mesmo e-mail resultavam em **dois usuários gravados**, ambas reportando sucesso.
Com a tradução do `P2002`, o teste de integração confirma: uma passa, a outra recebe
`EmailAlreadyInUseError`, e o banco fica com exatamente um registro.

**Alternativa descartada.** Remover a checagem prévia e depender só da constraint. Correto e mais
simples, mas pagaria o custo do hash em toda tentativa duplicada.

**Custo assumido.** A regra existe em dois lugares, e um leitor desatento pode achar que a checagem
prévia é a proteção. Daí o comentário explícito nos dois pontos.

---

## ADR-020 — Tokens de injeção no domínio

**Contexto.** Interfaces do TypeScript não existem em runtime, então `SimulationRepository` não
serve como token de injeção do NestJS. É preciso um valor concreto para amarrar a interface à
implementação.

**Decisão.** Constantes de string em `domain/repositories/tokens.ts`, e um único módulo
(`DatabaseModule`) fazendo a amarração. O token vive no domínio, junto da interface que nomeia,
porque faz parte do contrato — quem o consome é o caso de uso, não a infraestrutura.

`const` de string em vez de `Symbol`: aparecem legíveis nas mensagens de erro do Nest quando um
provider não está registrado.

**Alternativa descartada.** Classes abstratas como token, que funcionam em runtime e dispensam
constantes. Descartadas porque obrigariam o domínio a declarar `abstract class` só para satisfazer
o mecanismo de DI de um framework — exatamente o acoplamento que a ADR-001 evita.

**Custo assumido.** Tokens de string não são verificados pelo compilador: `@Inject('SimulationRepo')`
com erro de digitação só falha em runtime. Mitigado por exportar as constantes de um único arquivo
e por um teste de integração que resolve cada token do container.

---

## ADR-023 — 422 para regra de negócio, 400 para sintaxe

**Contexto.** Uma requisição pode falhar por dois motivos distintos: o corpo está malformado
(`termMonths: "trezentos"`), ou está bem formado mas viola uma regra (`termMonths: 500`, acima do
prazo máximo). Tratar os dois como 400 é comum e perde informação.

**Decisão.** **400** quando a validação sintática falha — tipo errado, campo faltando, valor fora
da faixa aceitável. **422 Unprocessable Entity** quando o corpo foi compreendido e uma regra de
negócio o rejeitou: LTV excedido, comprometimento de renda, aporte fora do prazo.

A distinção diz ao cliente **o que fazer**: 400 significa "corrija o formato do envio", 422
significa "os valores são válidos mas a operação não é permitida — mostre isso ao usuário".
Erros de domínio sem entrada explícita na tabela caem em 422, e não em 500: um erro de domínio
novo é sempre regra de negócio violada.

**Alternativa descartada.** 400 para tudo, que é mais simples e amplamente usado. Descartada porque
apaga a diferença entre erro do programador que integrou a API e situação legítima que o usuário
final precisa ver.

**Custo assumido.** 422 é menos conhecido que 400 e alguns clientes HTTP antigos o tratam
genericamente. O `code` estável na resposta mitiga: quem integra reage a ele, não ao status.

---

## ADR-024 — `forbidNonWhitelisted` no ValidationPipe

**Contexto.** A ADR-007 escolheu class-validator e registrou um risco: o tipo do DTO e seus
decorators são declarações separadas, então um campo pode existir na classe sem validação e passar
direto.

**Decisão.** `whitelist: true` **e** `forbidNonWhitelisted: true`. O primeiro descarta propriedades
não declaradas; o segundo **rejeita a requisição** quando elas existem.

O ganho concreto é de autorização. `POST /simulations` deriva o dono do token, nunca do corpo — mas
sem essa configuração, mandar `{"userId": "outro"}` seria silenciosamente ignorado, e um leitor do
código não teria como saber se o campo é usado ou não. Com ela, a tentativa recebe
`400 property userId should not exist`. Verificado contra a aplicação real.

**Alternativa descartada.** Apenas `whitelist`, que descarta em silêncio. Mais tolerante com
clientes que mandam campos a mais, e por isso mesmo pior: o cliente acha que enviou algo que a API
ignorou.

**Custo assumido.** Menos tolerância a evolução de cliente — um front que mande um campo novo antes
de a API suportá-lo quebra. Em compensação, a quebra é imediata e explícita, e não um dado
silenciosamente perdido.

---

## ADR-025 — Rate limiting relaxado em teste, verificado à parte

**Contexto.** O rate limiting protege login, cadastro e o preview público. Mas a suíte e2e faz
dezenas de cadastros do mesmo IP em segundos, e batia no teto de 5/min — 24 testes falharam com
429 na primeira execução, nenhum deles relacionado a rate limiting.

**Decisão.** Em `NODE_ENV=test`, os limites sobem para um valor efetivamente infinito
(`throttler.config.ts`). O comportamento real é verificado em `throttler.e2e-spec.ts`, que sobe uma
aplicação própria com os limites de produção e confirma o bloqueio, a persistência dentro da janela
e o isolamento entre rotas.

**Alternativa descartada.** Desligar o `ThrottlerGuard` em teste. Mais simples, mas deixaria a
funcionalidade sem cobertura alguma — e é justamente o tipo de proteção que se descobre quebrada em
produção.

Também descartado usar IPs diferentes por teste: exigiria manipular cabeçalhos de proxy e testaria
mais a configuração do supertest que a aplicação.

**Custo assumido.** A suíte principal não exercita o rate limiting, então uma regressão na
configuração de limites das rotas reais (um `@Throttle` removido por engano) não seria pega. Só o
mecanismo é testado, não a fiação de cada rota. Verificado manualmente com `curl` contra a
aplicação em execução: o login corta em 429 no limite configurado.

---

## ADR-026 — Imagem Docker multi-stage, sem root e com init

**Contexto.** A imagem precisa rodar em produção. Um `FROM node:20` copiando o projeto inteiro
funcionaria, e é o que a maioria dos tutoriais mostra.

**Decisão.** Três estágios — `deps`, `builder`, `runner` — e quatro escolhas que não são padrão:

- **Usuário `node`, não root.** Um comprometimento da aplicação não vira root no container.
- **`dumb-init` como PID 1.** O Node não é um init: sem ele, `SIGTERM` não propaga e o container
  leva 10s para morrer em todo deploy, sem executar o shutdown gracioso do Nest — o que interrompe
  requisições em andamento.
- **`HEALTHCHECK` com o próprio Node**, em vez de instalar `curl` na imagem final.
- **`app.listen(port, '0.0.0.0')`.** Dentro de um container, escutar só em loopback torna a
  aplicação inalcançável de fora — e o sintoma é "conecta em local, não conecta em produção".

**Alternativa descartada.** Imagem única sem multi-stage. Mais simples de ler, mas embarcaria
TypeScript, Jest, ESLint e o código-fonte — superfície de ataque maior e imagem várias vezes mais
pesada.

**Custo assumido.** Dockerfile mais longo e três estágios para entender. O `bcrypt` tem binding
nativo, então dois estágios precisam de `python3 make g++`, o que torna o build inicial lento.
Trocar por argon2 não ajudaria — também é nativo.

**Pendência honesta:** o build da imagem **não foi verificado localmente** nesta etapa. O Docker
Desktop entrou em falha persistente (erro 500 no engine) durante o trabalho e não se recuperou. A
estrutura foi validada estaticamente — estágios, referências `--from`, presença de `USER`,
`HEALTHCHECK` e `ENTRYPOINT` — e o CI executa `docker build` mais um teste de inicialização do
container a cada PR. Ainda assim, a primeira execução real da imagem acontecerá no CI, não aqui.

---

## ADR-027 — Swagger derivado dos decorators de validação

**Contexto.** A Etapa 6 pede documentação com exemplos reais. Há duas formas: escrever um arquivo
OpenAPI à mão, ou derivá-lo do código.

**Decisão.** `@nestjs/swagger`, gerando o schema a partir das mesmas classes que o `ValidationPipe`
usa. Foi exatamente o argumento que decidiu a ADR-007 a favor do class-validator: uma única
declaração vira validação e documentação.

A consequência que importa é que **a documentação não pode divergir do código**. Um campo novo sem
`@ApiProperty` aparece sem descrição, mas nunca aparece um campo que a API não aceita — que é o
modo de falha típico de documentação escrita à mão.

As descrições carregam a informação de domínio que o avaliador precisa: que valores são centavos,
que `NOMINAL` produz taxa maior que `EFFECTIVE`, que 400 é sintaxe e 422 é regra de negócio.

**Alternativa descartada.** Arquivo OpenAPI versionado à mão. Dá controle total sobre o resultado e
permite documentar antes de implementar. Descartado porque exige disciplina para manter em
sincronia — e documentação desatualizada é pior que documentação ausente.

**Custo assumido.** Mais decorators nos DTOs, e a versão 11.4.6 do `@nestjs/swagger` trouxe uma
dependência (`js-yaml`) com CVE de severidade **high**. Resolvido fixando a 11.4.5 e sobrepondo
`js-yaml` para 5.2.3 via `overrides` — `npm audit --omit=dev` volta a acusar zero. O CI passa a
rodar a auditoria a cada PR para que isso não regrida em silêncio.

---

## ADR-028 — Render em vez de Vercel

**Contexto.** O deploy precisa de aplicação e Postgres gerenciado. A preferência inicial era
Vercel, onde já havia conta.

**Decisão.** **Render.** Um `render.yaml` descreve app e banco; o Docker que já funciona vai
direto, e tudo fica numa conta só.

**Alternativa descartada.** Vercel, que é excelente para frontend e funções serverless, mas cria
duas dificuldades reais aqui: não hospeda Postgres — exigiria Neon ou Supabase à parte —, e o
Prisma em ambiente serverless abre uma conexão por invocação, esgotando o limite do Postgres sem
um pooler (`@prisma/adapter-neon` ou Accelerate). Seriam três serviços em vez de um, e adaptações
no bootstrap que só existiriam por causa da plataforma.

**Custo assumido.** O plano gratuito do Render **hiberna após 15 minutos** sem tráfego, e a
primeira requisição depois disso leva ~30 a 50 segundos. O Postgres gratuito **expira em 90 dias**.
Ambos estão documentados em `docs/deploy.md`, com a recomendação de avisar no README em vez de
deixar um avaliador achar que a API é lenta.

---

## ADR-029 — CVE transitiva do Prisma corrigida por `overrides`, não por versão major

**Contexto.** A auditoria do CI passou a reprovar o PR por uma CVE **high** no `deepmerge-ts`
(stack exhaustion ao mesclar objetos recursivos). Ele chega via `prisma` → `@prisma/config`, que
fixa a versão exata 7.1.5. O `npm audit fix --force` propõe resolver com o Prisma 7 — versão major,
com mudanças de configuração e de geração do client. As demais CVEs (multer, proxy-addr, qs,
js-yaml) saíram com `npm audit fix`, sem quebra.

**Decisão.** Sobrepor `deepmerge-ts` para `^8.0.2` via `overrides`, o mesmo mecanismo já usado
para o `js-yaml` (ADR-027). O pacote é usado num único ponto — o `@prisma/config` mescla o
arquivo de configuração do Prisma ao iniciar o CLI —, e a função chamada (`deepmerge`) mantém a
mesma assinatura. Verificado com `prisma validate`, `generate`, `migrate deploy` (local e dentro
da imagem Docker) e as suítes unitária e e2e completas.

**Alternativa descartada.** Migrar para o Prisma 7 agora. É a correção definitiva, mas mistura uma
atualização de ORM com risco próprio num PR de documentação e deploy. Também foi descartado
rebaixar o `--audit-level` do CI: a vulnerabilidade não é alcançável por entrada HTTP (só processa
a configuração do próprio projeto), mas afrouxar o portão silencia as próximas que forem.

**Custo assumido.** O Prisma 6 roda com uma versão de dependência que o time do Prisma não
testou. O risco é baixo pelo uso restrito, mas o override precisa ser **removido na migração para
o Prisma 7**, senão vira configuração fantasma. A auditoria do CI cobre só dependências de
produção (`--omit=dev`); as de desenvolvimento ficam fora do portão.

---

## ADR-030 — Aplicação no Compose com configuração fixa e segredos locais

**Contexto.** O critério de pronto da SPEC pede que um desconhecido suba a aplicação com um
comando. O Compose subia só o Postgres; rodar a API exigia `.env`, Node, `npm install`, migrations
e `start:dev` — cinco passos.

**Decisão.** Serviço `app` no `docker-compose.yml`, construído pelo mesmo Dockerfile de produção,
iniciando só depois do `healthcheck` do Postgres. A configuração fica fixa no próprio arquivo, sem
interpolar o `.env`, com `NODE_ENV=development` e segredos de JWT marcados como locais. O serviço
sobe por padrão: `docker compose up` entrega API + banco.

**Alternativa descartada.** Interpolar o `.env`: o `DATABASE_URL` de desenvolvimento aponta para
`localhost`, que dentro do container é o próprio container, e a conexão falharia. Também foi
descartado deixar o `app` atrás de um `profile`: exigiria `--profile app`, um detalhe que o
desconhecido não conhece. E `NODE_ENV=production` obrigaria a gerar segredos antes de subir.

**Custo assumido.** Segredos de JWT versionados no repositório — aceitáveis porque só assinam
tokens de um ambiente local descartável, como a senha `alicerce` do Postgres já fazia; produção
usa os gerados pelo Render. Quem desenvolve passa a subir só os bancos, com
`docker compose up -d postgres postgres-test`.

---

## ADR-031 — CORS por lista explícita de origens

**Contexto.** O front (`alicerce-web`) roda em outra origem e chama a API direto do navegador.
Sem CORS, o navegador bloqueia toda resposta, inclusive as de erro, e o front não consegue ler o
`code` de um 422.

**Decisão.** A variável `CORS_ORIGINS` recebe uma lista de origens exatas. O `loadEnv` valida cada
item (`new URL(x).origin === x`) e derruba o boot se algum estiver malformado. Com a lista vazia,
o CORS nem é registrado. Os métodos e headers liberados são só os que a API usa, e `credentials`
fica desligado, porque o token viaja no header `Authorization`, não em cookie.

**Alternativa descartada.** `origin: '*'`: qualquer site poderia ler respostas da API no navegador
de um usuário. Também foi descartado aceitar a lista sem validação: `http://localhost:3001/` (com
barra) nunca casa com o header `Origin`, e a falha só apareceria no console do navegador.

**Custo assumido.** Cada novo ambiente do front (preview da Vercel, homologação) exige atualizar a
variável na API. No Render, ela fica com `sync: false` e é preenchida no painel.

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
