# Lámpara hub: PocketBase + the Lámpara schema and server logic + the Lámpara website.
# Build from the repository root (docker-compose.yml does this): the website is built from the app's source.

# ---- 1. Build the website (Expo web export) ----
FROM node:24-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npx expo export --platform web --output-dir dist

# ---- 2. The server ----
FROM alpine:3.20

ARG PB_VERSION=0.40.6
# Set automatically by Docker BuildKit (amd64 or arm64); defaults to amd64.
ARG TARGETARCH=amd64

RUN apk add --no-cache ca-certificates unzip wget tzdata \
 && wget -q -O /tmp/pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip" \
 && unzip -q /tmp/pb.zip -d /pb \
 && rm /tmp/pb.zip

COPY server/pb_migrations /pb/pb_migrations
COPY server/pb_hooks /pb/pb_hooks
# The website: served at the hub's address (e.g. https://zimaos.your-tailnet.ts.net/).
COPY --from=web /app/dist /pb/pb_public

EXPOSE 8090
VOLUME /pb/pb_data

HEALTHCHECK --interval=30s --timeout=5s CMD wget -q -O /dev/null http://127.0.0.1:8090/api/health || exit 1

CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data", "--migrationsDir=/pb/pb_migrations", "--hooksDir=/pb/pb_hooks", "--publicDir=/pb/pb_public"]
