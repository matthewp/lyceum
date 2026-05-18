# Build stage: install all deps (incl. esbuild devDep) and produce the
# client bundle into public/build/.
FROM node:24-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY src/ src/
COPY public/ public/
COPY scripts/ scripts/
COPY tsconfig.json ./

RUN node scripts/build-client.ts

# Runtime stage: prod deps only + the build output copied from the builder.
FROM node:24-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src/ src/
COPY --from=builder /app/public/ public/
COPY tsconfig.json ./

EXPOSE 3000

CMD ["node", "--experimental-strip-types", "src/main.ts"]
