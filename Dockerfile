FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm prune --prod

FROM node:22-bookworm-slim
WORKDIR /app
# git only serves the difficulty bonus's optional local mirror (MIRROR_DIR).
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=8080 DATABASE_PATH=/data/pushfront.db CLIENT_DIR=/app/dist/client
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# The tree-sitter grammars (.wasm), vendored: rules/complexity.ts loads them from ../../assets/grammars.
COPY --from=build /app/assets ./assets
EXPOSE 8080
CMD ["node", "dist/server/main.js"]
