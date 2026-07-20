FROM node:20-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json yarn.lock* ./
RUN yarn install

FROM base AS builder
WORKDIR /app
RUN apk add --no-cache bash
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED 1
RUN yarn build

FROM base AS migrator
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./package.json
COPY scripts/migrate-database.mjs ./scripts/migrate-database.mjs
COPY scripts/verify-capacity-stress.mjs ./scripts/verify-capacity-stress.mjs
COPY drizzle ./drizzle
CMD ["node", "scripts/migrate-database.mjs"]

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
RUN apk add --no-cache bash
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
USER nextjs
EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"
CMD ["node", "server.js"]
