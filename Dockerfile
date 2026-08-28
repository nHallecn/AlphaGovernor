FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY . .
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app /app
RUN pnpm db:generate && pnpm build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=builder /app /app

FROM runtime AS api
EXPOSE 4000
CMD ["pnpm", "--filter", "@alphagovernor/api", "start"]

FROM runtime AS web
EXPOSE 3000
CMD ["pnpm", "--filter", "@alphagovernor/web", "start"]

FROM api AS runner
EXPOSE 3000 4000
