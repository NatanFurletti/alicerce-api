# syntax=docker/dockerfile:1

# ──────────────────────────────────────────────────────────────────────────────
# Build multi-stage.
#
# O objetivo é que a imagem final não carregue nada que só serviu para construir:
# nem TypeScript, nem Jest, nem o código-fonte. Só o JavaScript compilado, as
# dependências de produção e o Prisma Client gerado.
# ──────────────────────────────────────────────────────────────────────────────

# ── Estágio 1: dependências de produção ──────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# O bcrypt tem binding nativo; sem estas ferramentas o npm cai para compilar do
# código-fonte e falha na Alpine, que não traz build tools.
RUN apk add --no-cache python3 make g++

# Copiar apenas os manifestos primeiro faz esta camada ser reaproveitada em todo
# build que não mexeu nas dependências — o passo mais caro do processo.
COPY package.json package-lock.json ./
COPY prisma ./prisma

# `npm ci` respeita o lockfile e falha se ele divergir. `--omit=dev` deixa de
# fora TypeScript, Jest e ESLint. O `postinstall` gera o Prisma Client.
RUN npm ci --omit=dev && npm cache clean --force

# ── Estágio 2: compilação ────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY tsconfig*.json nest-cli.json ./
COPY src ./src

RUN npm run build

# ── Estágio 3: imagem final ──────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# `dumb-init` como PID 1: sem um init adequado, o Node não recebe SIGTERM
# corretamente e o container leva 10s para morrer em todo deploy, além de não
# executar o shutdown gracioso do Nest.
RUN apk add --no-cache dumb-init

ENV NODE_ENV=production

# Roda como usuário sem privilégios. A imagem `node` já traz o usuário `node`
# (uid 1000); um comprometimento da aplicação não vira root no container.
USER node

COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node package.json ./
# O schema e as migrations vão junto: o start aplica `migrate deploy`.
COPY --chown=node:node prisma ./prisma

EXPOSE 3000

# O healthcheck usa o próprio Node, sem curl — a imagem final não precisa dele.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]

# `migrate deploy` antes de subir: aplica o que está versionado, sem gerar
# migration nova nem pedir confirmação. É o mesmo comando que o CI já executa.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
