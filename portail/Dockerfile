# syntax=docker/dockerfile:1
# Le contexte de build est la RACINE du dépôt : le portail importe packages/detector.
#   docker build -f portail/Dockerfile .
# (docker-compose.prod.yml et docker-compose.portail.yml le font déjà.)
ARG DATABASE_URL=postgresql://eflex:eflexpass@localhost:5432/eflex
# Clé publique du captcha Turnstile (facultative). Inlinée par Next au build.
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY=
# Version/release injectée au build (error tracking, diagnostics).
ARG APP_VERSION=dev
ARG GIT_COMMIT_SHA=

FROM node:24-alpine AS builder
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY=
ARG APP_VERSION=dev
ARG GIT_COMMIT_SHA=
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=${NEXT_PUBLIC_TURNSTILE_SITE_KEY}
ENV APP_VERSION=${APP_VERSION}
ENV GIT_COMMIT_SHA=${GIT_COMMIT_SHA}
# Même disposition que dans le dépôt : portail/ et packages/ côte à côte,
# car le code importe « ../packages/detector » (alias @eflex/detector).
WORKDIR /repo/portail

ENV DATABASE_URL=${DATABASE_URL}

COPY portail/package.json portail/package-lock.json ./
RUN npm ci

COPY packages/detector /repo/packages/detector
COPY packages/renderer /repo/packages/renderer
COPY portail/ ./
RUN npx prisma generate
RUN npm run build

# Étape légère utilisée par le service compose `migrate` (profil "tools")
FROM node:24-alpine AS migrator
WORKDIR /app
COPY portail/package.json portail/package-lock.json ./
RUN npm ci
COPY portail/prisma ./prisma
CMD ["npx", "prisma", "migrate", "deploy"]

FROM node:24-alpine AS runner
WORKDIR /app
ARG APP_VERSION=dev
ARG GIT_COMMIT_SHA=
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV APP_VERSION=${APP_VERSION}
ENV GIT_COMMIT_SHA=${GIT_COMMIT_SHA}

COPY --from=builder /repo/portail/.next/standalone ./
COPY --from=builder /repo/portail/.next/static ./.next/static
COPY --from=builder /repo/portail/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
