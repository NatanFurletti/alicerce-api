# Deploy no Render

Guia passo a passo. A infraestrutura está descrita em [`render.yaml`](../render.yaml), então
a maior parte é automática.

---

## Antes de começar

O projeto precisa estar no GitHub com os commits publicados:

```bash
git push origin main
```

---

## 1. Criar o Blueprint

1. Acesse [dashboard.render.com](https://dashboard.render.com) e faça login.
2. **New +** → **Blueprint**.
3. Conecte a conta do GitHub e selecione o repositório `alicerce-api`.
4. O Render lê o `render.yaml` e mostra o que vai criar: um Postgres (`alicerce-db`) e um
   serviço web (`alicerce-api`).
5. **Apply**.

O primeiro build leva de 5 a 10 minutos — o Docker precisa compilar o binding nativo do
bcrypt.

---

## 2. Verificar os segredos de JWT

O `render.yaml` usa `generateValue: true`, então o Render cria os dois segredos sozinho.

**Confira que eles ficaram diferentes.** O `loadEnv` derruba a aplicação no boot se
`JWT_ACCESS_SECRET` e `JWT_REFRESH_SECRET` forem iguais — segredos idênticos fariam um
refresh token ter assinatura válida na rota de acesso ([ADR-006](decisions.md)).

No painel: **alicerce-api** → **Environment**. Se por acaso coincidirem, gere um novo:

```bash
openssl rand -base64 32
```

### Liberar o front (CORS)

Ainda em **Environment**, preencha `CORS_ORIGINS` com a URL do front, sem barra final. Por
exemplo, `https://alicerce-web.vercel.app`. Para mais de uma origem, separe com vírgula. Se ela
ficar vazia, a API continua funcionando pelo Swagger e pelo curl, mas o navegador recusa as
chamadas do front.

---

## 3. Confirmar que subiu

As migrations rodam automaticamente no start (`prisma migrate deploy`, no `CMD` do
Dockerfile). Verifique:

```bash
curl https://SEU-APP.onrender.com/health
# {"status":"ok","uptimeSeconds":12,"timestamp":"..."}
```

E abra a documentação interativa em `https://SEU-APP.onrender.com/docs`.

---

## 4. Teste de ponta a ponta

```bash
BASE=https://SEU-APP.onrender.com

curl -X POST $BASE/auth/register -H 'Content-Type: application/json' \
  -d '{"name":"Teste","email":"teste@example.com","password":"senha-valida-123"}'

TOKEN=$(curl -s -X POST $BASE/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"teste@example.com","password":"senha-valida-123"}' | jq -r .accessToken)

curl -X POST $BASE/simulations -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{
    "propertyValueCents": 50000000, "downPaymentCents": 10000000,
    "termMonths": 360, "annualRate": 0.0975,
    "rateConvention": "EFFECTIVE", "amortizationSystem": "SAC",
    "charges": {"mipMonthlyRate":0.00025,"dfiMonthlyRate":0.00005,"adminFeeCents":2500}
  }'
```

---

## Limitações do plano gratuito

Vale conhecê-las antes de mostrar o link a alguém:

| Limitação | Efeito |
|---|---|
| **Hibernação após 15 min sem tráfego** | A primeira requisição depois disso leva **~30 a 50 segundos**. Não é lentidão da API — é o container subindo do zero. |
| **Postgres expira em 90 dias** | O banco gratuito é removido após esse prazo. Anote a data; migrar para o plano pago ou recriar o banco resolve. |
| **512 MB de RAM / CPU compartilhada** | Suficiente para demonstração. Uma tabela de 420 meses leva microssegundos, mas o cold start é sensível. |

**Sobre a hibernação:** se for enviar o link para um recrutador, abra a aplicação alguns
minutos antes para que ela já esteja quente. Ou mencione no README que a primeira
requisição pode demorar — a segunda opção é mais honesta e evita a impressão de API lenta.

---

## Redeploy

Todo `push` na branch principal dispara um deploy automático. Para reverter, use
**Manual Deploy** → **Deploy a specific commit** no painel.
