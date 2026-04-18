FROM node:24-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src/ src/
COPY public/ public/
COPY tsconfig.json ./

EXPOSE 3000

CMD ["node", "--experimental-strip-types", "src/main.ts"]
