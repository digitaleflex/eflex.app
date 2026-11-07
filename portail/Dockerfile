# syntax=docker/dockerfile:1
ARG DATABASE_URL=postgresql://eflex:eflexpass@localhost:5432/eflex

FROM node:24-alpine AS builder
WORKDIR /app

ENV DATABASE_URL=${DATABASE_URL}

COPY package.json ./
RUN npm install

COPY . .
RUN npx prisma generate
RUN npm run build

# Étape légère utilisée par le service compose `migrate` (profil "tools")
FROM node:24-alpine AS migrator
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY prisma ./prisma
CMD ["npx", "prisma", "migrate", "deploy"]

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]