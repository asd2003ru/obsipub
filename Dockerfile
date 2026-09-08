# Stage 1: build web UI
FROM node:20-alpine AS web-builder
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ .
RUN npm run build

# Stage 2: build Go binary
FROM golang:1.27-alpine AS go-builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=web-builder /app/web/dist ./web/dist
RUN go build -o /bin/obsipub ./cmd/obsipub

# Final stage: Debian slim runtime
FROM debian:slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=go-builder /bin/obsipub /usr/local/bin/obsipub
COPY --from=web-builder /app/web/dist ./web/dist
RUN mkdir -p /data/notes
EXPOSE 8088
ENV OBSIPUB_HOST=0.0.0.0
ENV OBSIPUB_ROOT=/data/notes
ENV OBSIPUB_PORT=8088
ENTRYPOINT ["/usr/local/bin/obsipub"]
