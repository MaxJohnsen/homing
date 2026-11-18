# The web app is built once, here. The server runs its TypeScript directly.
FROM node:24-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY web web
RUN npm run build:web

FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY migrations migrations
COPY skills skills
COPY src src
COPY --from=web /app/web/dist web/dist
ARG VERSION=dev
ENV HOMING_VERSION=$VERSION HOST=0.0.0.0
USER node
EXPOSE 4100
CMD ["node", "src/server.ts"]
